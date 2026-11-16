import type { Document, IndexSpecification } from "mongodb";
export interface CollectionModel<T extends object> {
  name: string;
  defaults: () => Partial<T>;
  primaryKey: string;
  autoId: boolean;
  unique: string[];
  indexes: IndexSpecification[];
  references: { target: string; field: string; onDelete: string }[];
  validator: Document;
}
export function defineCollection<T extends object>(name: string, options: Omit<CollectionModel<T>, "name">): CollectionModel<T> { return { name, ...options }; }
