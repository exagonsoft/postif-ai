import { MongoClient, type ClientSession, type Document, type Sort } from "mongodb";
import type { CollectionModel } from "./model";
import { collections } from "./schema";
import { Increment } from "./filters";
const cache = globalThis as typeof globalThis & { postifMongo?: Promise<MongoClient> };
export function getMongoClient() {
  if (!cache.postifMongo) {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Configure your MongoDB Atlas connection.");
    cache.postifMongo = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 10000 }).connect().catch(error => { delete cache.postifMongo; throw error; });
  }
  return cache.postifMongo;
}
export async function getMongoDatabase() {
  if (!process.env.MONGODB_DB) throw new Error("MONGODB_DB is required.");
  return (await getMongoClient()).db(process.env.MONGODB_DB);
}
export async function closeDatabase() { if (cache.postifMongo) { await (await cache.postifMongo).close(); delete cache.postifMongo; } }
function clean<T>(doc: Document): T { const { _id, _revision, ...value } = doc; void _id; void _revision; return value as T; }
function defined(values: object): Document {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}
type Changes<T> = { [K in keyof T]?: T[K] | Increment };
class Repository {
  constructor(private session?: ClientSession) {}
  // Provider requests must never be placed in withTransaction callbacks, which MongoDB may retry.
  async withLease<T>(name: string, callback: () => Promise<T>, busy: T): Promise<T> {
    const leases = (await getMongoDatabase()).collection<{ _id: string; token: string; expiresAt: Date }>("_worker_leases");
    const token = crypto.randomUUID();
    try { await leases.updateOne({ _id: name }, { $setOnInsert: { token: "", expiresAt: new Date(0) } }, { upsert: true }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    const claimed = await leases.findOneAndUpdate({ _id: name, expiresAt: { $lte: new Date() } }, { $set: { token, expiresAt: new Date(Date.now() + 600000) } });
    if (!claimed) return busy;
    const heartbeat = setInterval(() => { void leases.updateOne({ _id: name, token }, { $set: { expiresAt: new Date(Date.now() + 600000) } }).catch(() => undefined); }, 30000);
    heartbeat.unref();
    try { return await callback(); }
    finally { clearInterval(heartbeat); await leases.updateOne({ _id: name, token }, { $set: { expiresAt: new Date(0) } }); }
  }
  async find<T extends object>(model: CollectionModel<T>, filter: Document = {}, options: { projection?: Document; sort?: Sort; limit?: number; skip?: number; maxTimeMS?: number; lock?: boolean } = {}): Promise<T[]> {
    const collection = (await getMongoDatabase()).collection(model.name);
    const cursor = collection.find(filter, { session: this.session, projection: options.projection }).sort(options.sort || {});
    if (options.limit) cursor.limit(options.limit);
    if (options.skip) cursor.skip(options.skip);
    if (options.maxTimeMS) cursor.maxTimeMS(options.maxTimeMS);
    const docs = await cursor.toArray();
    if (options.lock) {
      if (!this.session) throw new Error("A document lock requires a transaction.");
      for (const doc of docs) await collection.updateOne({ _id: doc._id }, { $inc: { _revision: 1 } }, { session: this.session });
    }
    return docs.map(doc => clean<T>(doc));
  }
  async count<T extends object>(model: CollectionModel<T>, filter: Document = {}) {
    return (await getMongoDatabase()).collection(model.name).countDocuments(filter, { session: this.session, maxTimeMS: 5000 });
  }
  async aggregate<TResult extends Document>(model: CollectionModel<object>, pipeline: Document[]): Promise<TResult[]> {
    return (await getMongoDatabase()).collection(model.name).aggregate<TResult>(pipeline, { session: this.session, maxTimeMS: 5000 }).toArray();
  }
  private async nextId(name: string, explicitId?: number) {
    if (explicitId !== undefined && !Number.isSafeInteger(explicitId)) throw new Error("Public IDs must be safe integers.");
    const counters = (await getMongoDatabase()).collection<{ _id: string; value: number }>("_counters");
    // The transactional counter also serializes duplicate checks for concurrent inserts.
    const result = await counters.findOneAndUpdate({ _id: name }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after", session: this.session });
    if (!Number.isSafeInteger(result!.value)) throw new Error("Public ID counter exceeded the safe integer range.");
    if (explicitId !== undefined) {
      await counters.updateOne({ _id: name }, { $max: { value: explicitId } }, { session: this.session });
      return explicitId;
    }
    return result!.value;
  }
  private async checkReferences<T extends object>(model: CollectionModel<T>, doc: Document) {
    for (const reference of model.references) {
      const value = doc[reference.field];
      if (value === null || value === undefined) continue;
      const target = collections.find(collection => collection.name === reference.target);
      if (!target) throw new Error(`Unknown reference target: ${reference.target}.`);
      // Touch the parent so a concurrent deletion conflicts and retries the transaction.
      const result = await (await getMongoDatabase()).collection(target.name).updateOne(
        { [target.primaryKey]: value },
        { $inc: { _revision: 1 } },
        { session: this.session },
      );
      if (!result.matchedCount) throw new Error(`Invalid reference: ${model.name}.${reference.field} must reference an existing ${target.name}.${target.primaryKey}.`);
    }
  }
  private async checkPrimaryKeyChange<T extends object>(model: CollectionModel<T>, previous: Document, doc: Document) {
    if (previous[model.primaryKey] === doc[model.primaryKey]) return;
    for (const dependent of collections) for (const reference of dependent.references) {
      if (reference.target !== model.name) continue;
      if ((await this.find(dependent as CollectionModel<object>, { [reference.field]: previous[model.primaryKey] }, { limit: 1 })).length) {
        throw new Error("Cannot change a primary key while the document is still referenced.");
      }
    }
  }
  async insert<T extends object>(model: CollectionModel<T>, values: Partial<T> | Partial<T>[], options: { ignoreDuplicates?: boolean } = {}): Promise<T[]> {
    if (!this.session) return this.transaction(tx => tx.insert(model, values, options));
    const collection = (await getMongoDatabase()).collection(model.name);
    const results: T[] = [];
    for (const value of Array.isArray(values) ? values : [values]) {
      const doc: Document = { ...model.defaults(), ...defined(value) };
      if (model.autoId) doc.id = await this.nextId(model.name, doc.id);
      await this.checkReferences(model, doc);
      const uniqueFilters = model.unique.filter(field => doc[field] !== undefined).map(field => ({ [field]: doc[field] }));
      if (options.ignoreDuplicates && uniqueFilters.length && await collection.findOne({ $or: uniqueFilters }, { session: this.session })) continue;
      await collection.insertOne(doc, { session: this.session });
      results.push(clean<T>(doc));
    }
    return results;
  }
  async update<T extends object>(model: CollectionModel<T>, filter: Document, changes: Changes<T>): Promise<T[]> {
    if (!this.session) return this.transaction(tx => tx.update(model, filter, changes));
    const collection = (await getMongoDatabase()).collection(model.name);
    const values: Document = {};
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      if (value instanceof Increment) {
        const addition = { $add: [`$${key}`, value.delta] };
        values[key] = value.floor === undefined ? addition : { $max: [value.floor, addition] };
      } else values[key] = { $literal: value };
    }
    const candidates = await collection.find(filter, { projection: { _id: 1, [model.primaryKey]: 1 }, session: this.session }).toArray();
    const result: T[] = [];
    for (const candidate of candidates) {
      const doc = await collection.findOneAndUpdate({ $and: [filter, { _id: candidate._id }] }, [{ $set: values }], { session: this.session, returnDocument: "after" });
      if (doc) {
        await this.checkReferences(model, doc);
        await this.checkPrimaryKeyChange(model, candidate, doc);
        result.push(clean<T>(doc));
      }
    }
    return result;
  }
  async upsert<T extends object>(model: CollectionModel<T>, field: string, initial: Partial<T>, changes: Partial<T>): Promise<T[]> {
    if (!this.session) return this.transaction(tx => tx.upsert(model, field, initial, changes));
    if (!model.unique.includes(field)) throw new Error("Upserts require a unique field.");
    const defaults: Document = { ...model.defaults(), ...defined(initial) };
    if (defaults[field] === undefined) throw new Error(`Upserts require a value for ${field}.`);
    const updates = defined(changes);
    if (updates[model.primaryKey] !== undefined || (updates[field] !== undefined && updates[field] !== defaults[field])) throw new Error("Upserts cannot change their primary or lookup keys.");
    if (model.autoId) defaults.id = await this.nextId(model.name, defaults.id);
    for (const key of Object.keys(updates)) delete defaults[key];
    const doc = await (await getMongoDatabase()).collection(model.name).findOneAndUpdate({ [field]: (initial as Document)[field] }, { $setOnInsert: defaults, $set: updates }, { upsert: true, returnDocument: "after", session: this.session });
    await this.checkReferences(model, doc!);
    return [clean<T>(doc!)];
  }
  async remove<T extends object>(model: CollectionModel<T>, filter: Document): Promise<void> {
    if (!this.session) return this.transaction(tx => tx.remove(model, filter));
    const docs = await this.find(model, filter);
    for (const doc of docs) for (const dependent of collections) for (const reference of dependent.references) {
      if (reference.target !== model.name) continue;
      const target = dependent as CollectionModel<object>;
      const match = { [reference.field]: (doc as Document)[model.primaryKey] };
      if (reference.onDelete === "cascade") await this.remove(target, match);
      else if (reference.onDelete === "set null") await this.update(target, match, { [reference.field]: null });
      else if ((await this.find(target, match, { limit: 1 })).length) throw new Error("Document is still referenced.");
    }
    await (await getMongoDatabase()).collection(model.name).deleteMany(filter, { session: this.session });
  }
  async transaction<T>(callback: (tx: Repository) => Promise<T>): Promise<T> {
    if (this.session) return callback(this);
    const session = (await getMongoClient()).startSession();
    try { return await session.withTransaction(() => callback(new Repository(session))); }
    finally { await session.endSession(); }
  }
  async ping() { await (await getMongoDatabase()).command({ ping: 1 }); }
}
export const db = new Repository();
export async function initializeDatabase() {
  const database = await getMongoDatabase();
  for (const model of collections) {
    try { await database.createCollection(model.name, { validator: { $jsonSchema: model.validator } }); }
    catch (error) { if ((error as { code?: number }).code !== 48) throw error; await database.command({ collMod: model.name, validator: { $jsonSchema: model.validator } }); }
    const collection = database.collection(model.name);
    for (const field of model.unique) await collection.createIndex({ [field]: 1 }, { unique: true });
    for (const index of model.indexes) await collection.createIndex(index);
    if (model.autoId) {
      const latest = await collection.find().sort({ id: -1 }).limit(1).next();
      await database.collection<{ _id: string; value: number }>("_counters").updateOne({ _id: model.name }, { $max: { value: latest?.id || 0 } }, { upsert: true });
    }
  }
  await database.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection("account_tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection("social_oauth_attempts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection("publishing_jobs").createIndex({ status: 1, scheduledFor: 1 });
  await database.collection("notification_deliveries").createIndex({ status: 1, availableAt: 1 });
  await database.collection("media_assets").createIndex({ generationStatus: 1, id: 1 });
}
