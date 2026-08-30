import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth/session";
import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, requiredString, toJson } from "@/lib/api/response";
import { User } from "@/models/user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = requiredString(body.email, "email").toLowerCase();
    const password = requiredString(body.password, "password");
    await connectToDatabase();
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !await bcrypt.compare(password, user.passwordHash)) throw new ApiError(401, "Invalid email or password.");
    await createSession({ id: user._id.toString(), name: user.name, email: user.email });
    return Response.json({ data: toJson({ id: user._id, name: user.name, email: user.email }) });
  } catch (error) { return errorResponse(error); }
}