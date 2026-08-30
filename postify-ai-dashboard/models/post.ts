import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const mediaSchema = new Schema({ originalName: String, path: String, mimeType: String, size: Number }, { _id: false });
const destinationSchema = new Schema({ accountId: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true }, platform: { type: String, required: true }, content: String, status: { type: String, enum: ["pending", "published", "failed"], default: "pending" }, externalId: String, error: String, metrics: { likes: Number, comments: Number, reach: Number, engagement: Number, syncedAt: Date } }, { _id: false });

const postSchema = new Schema({
  profileId: { type: Schema.Types.ObjectId, ref: "Profile", required: true, index: true },
  campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", index: true },
  title: { type: String, trim: true },
  contentHtml: { type: String, required: true },
  contentText: { type: String, required: true },
  media: [mediaSchema],
  destinations: [destinationSchema],
  scheduledFor: Date,
  timezone: { type: String, required: true },
  status: { type: String, enum: ["draft", "scheduled", "publishing", "published", "partially_failed", "failed", "stopped", "canceled"], required: true, default: "draft", index: true },
}, { timestamps: true });

postSchema.index({ profileId: 1, campaignId: 1, createdAt: -1 });

export type PostDocument = InferSchemaType<typeof postSchema>;
export const Post: Model<PostDocument> = models.Post || model<PostDocument>("Post", postSchema);