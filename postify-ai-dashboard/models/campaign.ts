import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const campaignSchema = new Schema({
  profileId: { type: Schema.Types.ObjectId, ref: "Profile", required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: { type: String, enum: ["draft", "active", "archived"], default: "draft", index: true },
  startsAt: Date,
  endsAt: Date,
}, { timestamps: true });

campaignSchema.index({ profileId: 1, status: 1, createdAt: -1 });

export type CampaignDocument = InferSchemaType<typeof campaignSchema>;
export const Campaign: Model<CampaignDocument> = models.Campaign || model<CampaignDocument>("Campaign", campaignSchema);