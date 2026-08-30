import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const profileMembershipSchema = new Schema({
  profileId: { type: Schema.Types.ObjectId, ref: "Profile", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, enum: ["owner", "admin", "editor", "viewer"], required: true, default: "viewer" },
}, { timestamps: true });

profileMembershipSchema.index({ profileId: 1, userId: 1 }, { unique: true });

export type ProfileMembershipDocument = InferSchemaType<typeof profileMembershipSchema>;
export const ProfileMembership: Model<ProfileMembershipDocument> = models.ProfileMembership || model<ProfileMembershipDocument>("ProfileMembership", profileMembershipSchema);