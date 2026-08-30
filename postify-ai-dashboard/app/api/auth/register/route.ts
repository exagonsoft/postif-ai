import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth/session";
import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, requiredString, toJson } from "@/lib/api/response";
import { User } from "@/models/user";
import { Profile } from "@/models/profile";
import { ProfileMembership } from "@/models/profile-membership";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = requiredString(body.name, "name");
    const email = requiredString(body.email, "email").toLowerCase();
    const password = requiredString(body.password, "password");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, "email must be valid.");
    if (password.length < 12) throw new ApiError(400, "password must be at least 12 characters.");
    await connectToDatabase();
    if (await User.exists({ email })) throw new ApiError(409, "An account with this email already exists.");
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: "owner" });
    const profile = await Profile.create({ ownerId: user._id, name: `${name}'s workspace`, kind: "personal", timezone: "America/Santo_Domingo" });
    await ProfileMembership.create({ profileId: profile._id, userId: user._id, role: "owner" });
    await createSession({ id: user._id.toString(), name: user.name, email: user.email });
    return Response.json({ data: toJson({ id: user._id, name: user.name, email: user.email }) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}