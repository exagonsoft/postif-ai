import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["owner", "member"], default: "owner" },
}, { timestamps: true });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User: Model<UserDocument> = models.User || model<UserDocument>("User", userSchema);