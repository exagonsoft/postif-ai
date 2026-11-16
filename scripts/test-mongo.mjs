import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { mkdtemp, rmdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import "./register-ts.mjs";
const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
process.env.MONGODB_URI = replica.getUri();
process.env.MONGODB_DB = "postif_test";
process.env.MONGO_TEST_DATABASE = "true";
process.env.ENCRYPTION_SECRET = "isolated-test-encryption-key-not-for-production";
process.env.SMTP_URL = "";
process.env.VAPID_PRIVATE_KEY = "";
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_SUBJECT = "";
process.env.WORKER_SECRET = "isolated-worker-test-secret-not-for-production";
process.env.BILLING_ENABLED = "false";
process.env.PAYPAL_ENVIRONMENT = "sandbox";
process.env.PAYPAL_CLIENT_ID = "";
process.env.PAYPAL_CLIENT_SECRET = "";
process.env.PAYPAL_WEBHOOK_ID = "";
process.env.OPENAI_API_KEY = "";
process.env.RUNWAY_API_KEY = "";
const mediaDirectory = await mkdtemp(path.join(tmpdir(), "postif-test-media-"));
process.env.MEDIA_STORAGE_DIR = mediaDirectory;
process.env.MEDIA_STORAGE_PROVIDER = "local";
const { db, initializeDatabase, closeDatabase, getMongoDatabase } = await import("../src/db/index.ts");
const schema = await import("../src/db/schema.ts");
let server;
function run(file, env = {}) {
  return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{stdio:"inherit",env:{...process.env,...env}});child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`${file} failed (${code})`)));});
}
try {
  await initializeDatabase();
  await initializeDatabase();
  const [user] = await db.insert(schema.users,{email:"repository@example.test",name:"Repository",passwordHash:"test"});
  await assert.rejects(db.insert(schema.users,{email:user.email,name:"Duplicate",passwordHash:"test"}), {code:11000});
  const [defaultsUser] = await db.insert(schema.users, { email: "defaults@example.test", name: "Defaults", passwordHash: "test", systemRole: undefined });
  assert.equal(defaultsUser.systemRole, "user", "Undefined values must not replace defaults");
  assert.ok(defaultsUser.createdAt instanceof Date);
  assert.ok(!("_id" in defaultsUser) && !("_revision" in defaultsUser));
  await assert.rejects(db.insert(schema.users, [
    { email: "atomic@example.test", name: "Atomic", passwordHash: "test" },
    { email: user.email, name: "Duplicate", passwordHash: "test" },
  ]), { code: 11000 });
  assert.equal((await db.find(schema.users, { email: "atomic@example.test" })).length, 0, "Failed batches must roll back earlier inserts");
  await assert.rejects(db.update(schema.users, { id: { $in: [user.id, defaultsUser.id] } }, { email: "collision@example.test" }), { code: 11000 });
  assert.deepEqual((await db.find(schema.users, { id: { $in: [user.id, defaultsUser.id] } }, { sort: { id: 1 } })).map(row => row.email), [user.email, defaultsUser.email], "Failed multi-document updates must roll back");
  assert.deepEqual(await db.insert(schema.users, { id: user.id, email: "primary-conflict@example.test", name: "Duplicate", passwordHash: "test" }, { ignoreDuplicates: true }), []);
  await db.insert(schema.notificationPreferences, { userId: user.id }, { ignoreDuplicates: true });
  assert.deepEqual(await db.insert(schema.notificationPreferences, { userId: user.id, email: true }, { ignoreDuplicates: true }), [], "Duplicate-ignore must work for non-generated primary keys");
  assert.equal((await db.find(schema.notificationPreferences, { userId: user.id }))[0].email, false);
  const preferenceResults = await Promise.all(Array.from({ length: 10 }, () => db.insert(schema.notificationPreferences, { userId: defaultsUser.id }, { ignoreDuplicates: true })));
  assert.equal(preferenceResults.flat().length, 1, "Non-generated primary keys must also ignore concurrent duplicates");
  await Promise.all(Array.from({ length: 10 }, () => db.upsert(schema.notificationPreferences, "userId", { userId: defaultsUser.id }, { email: true })));
  assert.equal((await db.find(schema.notificationPreferences, { userId: defaultsUser.id }))[0].email, true);
  const duplicateResults = await Promise.all(Array.from({ length: 10 }, () => db.insert(schema.users, { email: "concurrent-duplicate@example.test", name: "Concurrent duplicate", passwordHash: "test" }, { ignoreDuplicates: true })));
  assert.equal(duplicateResults.flat().length, 1, "Concurrent duplicate-ignore inserts must insert exactly once");
  await assert.rejects(db.insert(schema.workspaces, { name: "Orphan", slug: "orphan", ownerId: -1 }), /reference/i);
  await assert.rejects(db.upsert(schema.notificationPreferences, "userId", { userId: -1 }, { email: true }), /reference/i);
  assert.equal((await db.find(schema.notificationPreferences, { userId: -1 })).length, 0);
  const [explicit] = await db.upsert(schema.users, "email", { id: 5000, email: "explicit@example.test", name: "Explicit", passwordHash: "test", systemRole: undefined }, { name: "Explicit upsert", systemRole: undefined });
  assert.equal(explicit.id, 5000, "Upserts must preserve supplied IDs");
  assert.equal(explicit.systemRole, "user");
  const [next] = await db.insert(schema.users, { email: "after-explicit@example.test", name: "Next", passwordHash: "test" });
  assert.ok(next.id > explicit.id, "Explicit IDs must advance the counter");
  await initializeDatabase();
  const [afterInit] = await db.insert(schema.users, { email: "after-init@example.test", name: "After init", passwordHash: "test" });
  assert.ok(afterInit.id > next.id, "Initialization must preserve documents and counters");
  await assert.rejects(db.transaction(async tx=>{await tx.insert(schema.workspaces,{name:"Rolled back",slug:"rollback",ownerId:user.id});throw new Error("rollback");}), /rollback/);
  assert.equal((await db.find(schema.workspaces,{slug:"rollback"})).length,0);
  const [workspace]=await db.insert(schema.workspaces,{name:"Concurrent",slug:"concurrent",ownerId:user.id,aiCreditsBalance:100});
  await assert.rejects(db.update(schema.workspaces, { id: workspace.id }, { ownerId: -1 }), /reference/i);
  await assert.rejects(db.upsert(schema.workspaces, "slug", { slug: workspace.slug }, { ownerId: -1 }), /reference/i);
  assert.equal((await db.find(schema.workspaces, { id: workspace.id }))[0].ownerId, user.id);
  await assert.rejects(db.update(schema.users, { id: user.id }, { id: 100000 }), /still referenced/i);
  assert.equal((await db.find(schema.users, { id: user.id })).length, 1);
  const [member] = await db.insert(schema.workspaceMembers, { workspaceId: workspace.id, userId: defaultsUser.id, invitedEmail: defaultsUser.email, memberName: defaultsUser.name });
  await db.remove(schema.users, { id: defaultsUser.id });
  assert.equal((await db.find(schema.workspaceMembers, { id: member.id }))[0].userId, null, "Deleting a referenced user must clear nullable membership references");
  const [raceUser] = await db.insert(schema.users, { email: "reference-race@example.test", name: "Reference race", passwordHash: "test" });
  let releaseDeletion;
  let markSnapshotReady;
  const deletionGate = new Promise(resolve => { releaseDeletion = resolve; });
  const snapshotReady = new Promise(resolve => { markSnapshotReady = resolve; });
  const deletion = db.transaction(async tx => {
    await tx.find(schema.users, { id: raceUser.id });
    markSnapshotReady();
    await deletionGate;
    await tx.remove(schema.users, { id: raceUser.id });
  });
  await snapshotReady;
  try {
    await db.insert(schema.workspaces, { name: "Reference race", slug: "reference-race", ownerId: raceUser.id });
  } finally { releaseDeletion(); }
  await deletion;
  assert.equal((await db.find(schema.workspaces, { slug: "reference-race" })).length, 0, "A stale deletion snapshot must retry and cascade to concurrently inserted children");
  const {increment}=await import("../src/db/filters.ts");
  await Promise.all(Array.from({length:10},()=>db.transaction(async tx=>{const [w]=await tx.find(schema.workspaces,{id:workspace.id},{lock:true});if(w.aiCreditsBalance>=10)await tx.update(schema.workspaces,{id:w.id},{aiCreditsBalance:increment(-10)});} )));
  assert.equal((await db.find(schema.workspaces,{id:workspace.id}))[0].aiCreditsBalance,0);
  const ids=await Promise.all(Array.from({length:15},(_,i)=>db.insert(schema.users,{email:`id-${i}@example.test`,name:"ID",passwordHash:"test"}).then(rows=>rows[0].id)));
  assert.equal(new Set(ids).size,15);
  await db.remove(schema.users,{id:user.id});
  assert.equal((await db.find(schema.workspaces,{id:workspace.id})).length,0);
  await db.remove(schema.users,{id:{$in:ids}});
  await db.remove(schema.users, { email: { $in: ["concurrent-duplicate@example.test", "explicit@example.test", "after-explicit@example.test", "after-init@example.test"] } });
  await assert.rejects((await getMongoDatabase()).collection("posts").insertOne({title:123}),{code:121});
  console.log("MongoDB checks passed: repeatable initialization, defaults, unique indexes, atomic batches/updates, concurrent duplicate-ignore, reference validation, rollback, concurrent credit reservations, numeric IDs, cascade and set-null deletion.");
  await run("scripts/test-entitlements.mjs");
  await run("scripts/test-media-generation.mjs");
  await run("scripts/test-social.mjs");
  await run("scripts/test-media-generation.mjs", { TEST_STORAGE_PROVIDER: "s3" });
  await run("scripts/test-social.mjs", { TEST_STORAGE_PROVIDER: "s3" });
  if(process.argv.includes("--http")) {
    const portServer = createServer();
    await new Promise((resolve, reject) => { portServer.once("error", reject); portServer.listen(0, "127.0.0.1", resolve); });
    const address = portServer.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    await new Promise((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
    process.env.TEST_APP_URL=`http://127.0.0.1:${port}`;
    process.env.APP_URL=process.env.TEST_APP_URL;
    process.env.ENABLE_DEMO_MODE="true";
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)],{stdio:"inherit",env:process.env});
    let ready=false;
    for(let i=0;i<60;i++){try{const response=await fetch(`${process.env.TEST_APP_URL}/api/health`);if(response.ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,500));}
    assert.ok(ready,"Test app must become healthy");
    await run("scripts/test-integration.mjs");
  }
  const {ensureSeeded}=await import("./fixtures/seed.ts");
  await ensureSeeded(true);
  const counts=await Promise.all(schema.collections.map(m=>db.find(m).then(rows=>rows.length)));
  assert.ok(counts[0]>0,"Seed must insert demo data");
  await ensureSeeded(true);
  assert.deepEqual(await Promise.all(schema.collections.map(m=>db.find(m).then(rows=>rows.length))),counts);
  console.log("Demo seed passed: all collections validate, repeated seeding is idempotent.");
} finally {
  if(server) { const stopped=new Promise(resolve=>server.once("exit",resolve));server.kill();await stopped; }
  await closeDatabase();await replica.stop();
  const workspaceDirectory = path.join(mediaDirectory, "workspaces");
  try {
    for (const entry of await readdir(workspaceDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) throw new Error("Unexpected temporary media directory");
      await rmdir(path.join(workspaceDirectory, entry.name));
    }
    await rmdir(workspaceDirectory);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await rmdir(mediaDirectory);
}
