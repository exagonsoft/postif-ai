import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/database/mongodb";
import { ApiError, errorResponse, requiredString, toJson } from "@/lib/api/response";
import { User } from "@/models/user";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectToDatabase();
    return Response.json({ data: toJson(await User.find().sort({ createdAt: -1 }).lean()) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = requiredString(body.password, "password");
    if (password.length < 12) throw new ApiError(400, "password must be at least 12 characters.");
    await connectToDatabase();
    const user = await User.create({ email: requiredString(body.email, "email").toLowerCase(), name: requiredString(body.name, "name"), passwordHash: await bcrypt.hash(password, 12), role: body.role === "member" ? "member" : "owner" });
    return Response.json({ data: toJson(user) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}