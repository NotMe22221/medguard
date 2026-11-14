import { scanLabel } from "@/lib/ai";
import { errorResponse } from "@/lib/claude";

export const maxDuration = 60;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export async function POST(req: Request) {
  const { data, mediaType } = (await req.json()) as { data?: string; mediaType?: string };
  if (!data || !mediaType || !TYPES.includes(mediaType)) {
    return Response.json({ error: "Send a JPG, PNG, WEBP or PDF." }, { status: 400 });
  }
  try {
    return Response.json(await scanLabel({ data, mediaType }));
  } catch (err) {
    return errorResponse(err);
  }
}
