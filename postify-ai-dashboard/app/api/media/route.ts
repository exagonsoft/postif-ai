import { connectToDatabase } from "@/lib/database/mongodb";
import { errorResponse, requiredId } from "@/lib/api/response";
import { storeProfileMedia } from "@/lib/storage/profile-media";
import { Profile } from "@/models/profile";
import { requireTenantAccess } from "@/lib/auth/tenant-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const profileId = requiredId(formData.get("profileId"), "profileId");
    await requireTenantAccess(profileId, "editor");
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ error: "file is required." }, { status: 400 });
    await connectToDatabase();
    if (!await Profile.exists({ _id: profileId })) return Response.json({ error: "Profile was not found." }, { status: 404 });
    return Response.json({ data: await storeProfileMedia(profileId, file) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}