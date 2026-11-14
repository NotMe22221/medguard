import { runDeterministic } from "@/lib/pipeline";
import { reviewWithAI } from "@/lib/ai";
import { errorResponse } from "@/lib/claude";
import type { MedInput } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { meds, ai = true } = (await req.json()) as { meds: MedInput[]; ai?: boolean };
  if (!Array.isArray(meds) || meds.length < 1 || meds.length > 20) {
    return Response.json({ error: "Add between 1 and 20 medicines." }, { status: 400 });
  }
  const { result, labels } = await runDeterministic(meds);
  if (!ai || meds.length < 1) return Response.json({ result, summary: "", rejected: 0 });

  try {
    const reviewed = await reviewWithAI(result, labels);
    return Response.json(reviewed);
  } catch (err) {
    // Rule-based results stand on their own; AI is an extra layer.
    const reason = (await errorResponse(err).json()).error as string;
    return Response.json({ result: { ...result, warnings: [...result.warnings, `AI review unavailable: ${reason}`] }, summary: "", rejected: 0 });
  }
}
