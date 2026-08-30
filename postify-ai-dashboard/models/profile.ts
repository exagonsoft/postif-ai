import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const profileSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ["personal", "business"], required: true },
  timezone: { type: String, required: true, default: "America/Santo_Domingo" },
}, { timestamps: true });

export type ProfileDocument = InferSchemaType<typeof profileSchema>;
export const Profile: Model<ProfileDocument> = models.Profile || model<ProfileDocument>("Profile", profileSchema);