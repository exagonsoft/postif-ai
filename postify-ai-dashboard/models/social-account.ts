import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const socialAccountSchema = new Schema({
  profileId: { type: Schema.Types.ObjectId, ref: "Profile", required: true, index: true },
  platform: { type: String, enum: ["instagram", "facebook", "linkedin", "pinterest", "x", "youtube"], required: true },
  displayName: { type: String, required: true, trim: true },
  handle: { type: String, trim: true },
  status: { type: String, enum: ["connected", "expired", "revoked", "pending"], default: "pending" },
  scopes: [{ type: String }],
  destinationId: { type: String, required: true },
}, { timestamps: true });

socialAccountSchema.index({ profileId: 1, platform: 1, destinationId: 1 }, { unique: true });
export type SocialAccountDocument = InferSchemaType<typeof socialAccountSchema>;
export const SocialAccount: Model<SocialAccountDocument> = models.SocialAccount || model<SocialAccountDocument>("SocialAccount", socialAccountSchema);