import { defineCollection } from "./model";
import type { PlanDefinition } from "@/lib/plans";
import type { PayPalPaymentPolicy } from "@/lib/paypal";

export interface CatalogProduct {
  id: number;
  slug: string;
  name: string;
  description: string;
  revision: number;
  archived: boolean;
  publishingVersionId: number | null;
  paypalProducts?: Partial<Record<"sandbox" | "live", { id: string; accountKey: string }>>;
}
export interface CatalogPlan {
  id: number;
  slug: string;
  productId: number;
  draft: PlanDefinition;
  revision: number;
  archived: boolean;
  currentVersions: { local?: number; sandbox?: number; live?: number };
  publishingVersionId: number | null;
  detailsUpdatingVersionId?: number | null;
}
export interface ProviderRequest {
  requestId: string;
  requestedId?: string;
  startedAt: Date | null;
  providerId: string | null;
  name?: string;
  description?: string;
  paymentPolicy?: PayPalPaymentPolicy;
  nameCorrection?: { name: string; description?: string; previousName: string; previousDescription?: string; requestedAt: Date; confirmedAt: Date | null; error: string | null };
}
export interface CatalogVersion {
  id: number;
  planId: number;
  productId: number;
  draftRevision: number;
  productRevision: number;
  definition: PlanDefinition;
  presentation?: { name: string; description: string };
  presentationRevision?: number;
  detailsUpdate?: { name: string; description: string; originalDescription?: string; requestedAt: Date; confirmedAt: Date | null };
  product: { name: string; description: string };
  environment: "local" | "sandbox" | "live";
  status: "pending" | "published" | "superseded";
  productRequest: ProviderRequest;
  monthRequest: ProviderRequest;
  yearRequest: ProviderRequest;
  leaseToken: string | null;
  leaseExpiresAt: Date;
  createdAt: Date;
  publishedAt: Date | null;
  approval?: { userId: number; accountKey: string };
  publicationAttempts?: number;
  publicationError?: string | null;
  syncStatus?: "verified" | "drift" | "unverified";
  syncCheckedAt?: Date;
  syncError?: string | null;
  syncAccountKey?: string;
}

const number = { bsonType: ["int", "long", "double"] };
const options = {
  primaryKey: "id", autoId: true, unique: ["id"], indexes: [],
  references: [],
};
export const catalogProducts = defineCollection<CatalogProduct>("billing_catalog_products", {
  ...options, unique: ["id", "slug"],
  defaults: () => ({ revision: 1, archived: false, publishingVersionId: null }),
  validator: { bsonType: "object", required: ["id", "slug", "name", "description", "revision", "archived"], properties: { id: number, slug: { bsonType: "string" }, name: { bsonType: "string" }, description: { bsonType: "string" }, revision: number, archived: { bsonType: "bool" } } },
});
export const catalogPlans = defineCollection<CatalogPlan>("billing_catalog_plans", {
  ...options, unique: ["id", "slug"], indexes: [{ productId: 1 }],
  references: [{ target: "billing_catalog_products", field: "productId", onDelete: "restrict" }],
  defaults: () => ({ revision: 1, archived: false, currentVersions: {}, publishingVersionId: null }),
  validator: { bsonType: "object", required: ["id", "slug", "productId", "draft", "revision", "archived", "currentVersions"], properties: { id: number, slug: { bsonType: "string" }, productId: number, draft: { bsonType: "object" }, revision: number, archived: { bsonType: "bool" }, currentVersions: { bsonType: "object" } } },
});
export const catalogVersions = defineCollection<CatalogVersion>("billing_catalog_versions", {
  ...options, indexes: [{ planId: 1, environment: 1, status: 1 }],
  references: [
    { target: "billing_catalog_products", field: "productId", onDelete: "restrict" },
    { target: "billing_catalog_plans", field: "planId", onDelete: "restrict" },
  ],
  defaults: () => ({}),
  validator: { bsonType: "object", required: ["id", "planId", "productId", "definition", "environment", "status", "createdAt", "leaseExpiresAt"], properties: { id: number, planId: number, productId: number, definition: { bsonType: "object" }, environment: { enum: ["local", "sandbox", "live"] }, status: { enum: ["pending", "published", "superseded"] }, createdAt: { bsonType: "date" }, leaseExpiresAt: { bsonType: "date" } } },
});
export const catalogCollections = [catalogProducts, catalogPlans, catalogVersions];
