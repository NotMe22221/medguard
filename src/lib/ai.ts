import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getClient, MODEL, FALLBACK_BETA } from "./claude";
import type { Label } from "./fda";
import type { CheckResult, Evidence, Finding, ResolvedMed } from "./types";
import { norm, sortFindings } from "./checks";

/* ------------------------------------------------------------------ */
/* Label scanning                                                      */
/* ------------------------------------------------------------------ */

export const ScanSchema = z.object({
  isMedicationLabel: z.boolean(),
  products: z.array(
    z.object({
      productName: z.string().describe("Brand and product name as printed, with strength if shown, e.g. 'Advil 200 mg'"),
      ingredients: z.array(
        z.object({
          name: z.string().describe("Active ingredient exactly as printed, e.g. 'Acetaminophen' or 'Doxylamine succinate'"),
          strengthMg: z.number().nullable().describe("Milligrams per dose unit (per tablet, or per labeled dose for liquids). Convert mcg/g to mg. null if not shown."),
        })
      ),
      unitsPerDose: z.number().nullable().describe("Tablets/capsules per dose for adults, or 1 for a liquid dose whose strength is per dose. Use the usual dose, not the 'if needed' higher dose. null if unclear."),
      maxDosesPerDay: z.number().nullable().describe("Most doses allowed in 24 h per the label or prescription. null if not stated."),
      directions: z.string().describe("Adult directions as printed, or the prescription sig"),
      unreadable: z.string().describe("Anything that couldn't be read clearly, or empty string"),
    })
  ),
});
export type Scan = z.infer<typeof ScanSchema>;

const SCAN_SYSTEM = `You read photos of medicine packaging (OTC Drug Facts panels, pharmacy prescription labels, bottles, boxes) and transcribe them exactly.
- Only report what is printed. Never guess an ingredient or strength from the brand name; if the Active ingredients panel isn't visible, list the ingredients you can read and say what's missing in "unreadable".
- One entry per distinct product visible.
- If the photo is not a medicine label, set isMedicationLabel to false and return no products.`;

export async function scanLabel(image: { data: string; mediaType: string }): Promise<Scan> {
  const isPdf = image.mediaType === "application/pdf";
  const block: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: image.data } }
    : { type: "image", source: { type: "base64", media_type: image.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: image.data } };
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ScanSchema) },
    system: SCAN_SYSTEM,
    messages: [{ role: "user", content: [block, { type: "text", text: "Transcribe the medication label(s) in this image." }] }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Couldn't read the label.");
  return res.parsed_output;
}

/* ------------------------------------------------------------------ */
/* AI review of label text, with quote verification                    */
/* ------------------------------------------------------------------ */

const ReviewSchema = z.object({
  summary: z.string().describe("Two plain sentences for the patient: the most important thing to do"),
  interactions: z.array(
    z.object({
      medA: z.string().describe("id of the first medicine"),
      medB: z.string().describe("id of the second medicine"),
      severity: z.enum(["high", "moderate"]),
      title: z.string().describe("Short, e.g. 'Higher bleeding risk'"),
      explanation: z.string().describe("2-3 plain sentences: what can happen and why"),
      action: z.string().describe("One concrete step, e.g. 'Ask your pharmacist for a pain reliever that's safe with Eliquis.'"),
      quotes: z.array(
        z.object({
          ingredient: z.string().describe("Which ingredient's label the quote is from (as given in <labels>)"),
          section: z.string(),
          quote: z.string().describe("Copied EXACTLY, character for character, from that label. One sentence."),
        })
      ),
    })
  ),
  instructions: z.array(
    z.object({
      medId: z.string(),
      issue: z.string().describe("What is confusing or risky about the directions as written"),
      clarification: z.string().describe("What to ask or how to read it, without inventing a dose"),
    })
  ),
});

const REVIEW_SYSTEM = `You are MedGuard, a medication-safety reviewer for patients and family caregivers.
You receive a list of medicines (with RxNorm ingredients and FDA classes), checks already found by rules, and excerpts of official FDA labels.

Rules:
- Report an interaction ONLY if an FDA label excerpt provided supports it, and quote the supporting sentence EXACTLY as written (it will be machine-verified; paraphrased quotes are discarded).
- Ignore label sentences that say there is no meaningful interaction.
- Write for a non-expert at about an 8th-grade reading level. Never tell anyone to stop a prescribed medicine on their own; direct them to a pharmacist or doctor.
- Instructions: flag directions that are vague ("take as directed"), have ranges without a clear maximum, or could be misread. Do not invent doses.
- Don't repeat duplicate-ingredient findings; they're already handled.`;

const LABEL_CHARS = 7000;

export async function reviewWithAI(result: CheckResult, labels: Map<string, Label>): Promise<{ result: CheckResult; summary: string; rejected: number }> {
  const meds = result.meds.map((m: ResolvedMed) => ({
    id: m.input.id,
    name: m.input.name,
    directions: m.input.directions,
    ingredients: m.ingredients.map((i) => ({ name: i.name, classes: i.classes })),
  }));
  const labelText = [...labels.values()]
    .map((l) => `<label ingredient="${l.ingredient}" title="${l.title}">\n${Object.entries(l.sections).map(([s, t]) => `## ${s}\n${t}`).join("\n").slice(0, LABEL_CHARS)}\n</label>`)
    .join("\n");

  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ReviewSchema) },
    system: REVIEW_SYSTEM,
    messages: [{
      role: "user",
      content: `<medicines>\n${JSON.stringify(meds)}\n</medicines>\n<rule_findings>\n${JSON.stringify(result.findings.map((f) => ({ kind: f.kind, title: f.title, meds: f.meds })))}\n</rule_findings>\n<labels>\n${labelText}\n</labels>`,
    }],
  });
  const out = res.parsed_output;
  if (res.stop_reason === "refusal" || !out) return { result, summary: "", rejected: 0 };

  // Verify every quote against the real label text. Unverifiable claims are dropped.
  const fullText = new Map([...labels.values()].map((l) => [l.ingredient, norm(Object.values(l.sections).join(" "))]));
  const byId = new Map(result.meds.map((m) => [m.input.id, m]));
  let rejected = 0;
  const findings = [...result.findings];

  for (const it of out.interactions) {
    const a = byId.get(it.medA), b = byId.get(it.medB);
    if (!a || !b || a === b) { rejected++; continue; }
    const ev: Evidence[] = [];
    for (const q of it.quotes) {
      const key = q.ingredient.toLowerCase();
      const text = fullText.get(key);
      if (text && norm(q.quote).length > 20 && text.includes(norm(q.quote))) {
        const l = labels.get(key)!;
        ev.push({ quote: q.quote, labelTitle: l.title, section: q.section, url: l.url });
      }
    }
    if (!ev.length) { rejected++; continue; }
    const existing = findings.find((f) => f.kind === "interaction" && f.meds.includes(a.input.id) && f.meds.includes(b.input.id));
    const merged: Finding = {
      id: existing?.id ?? `ai-${a.input.id}-${b.input.id}`,
      kind: "interaction",
      // AI can raise severity but never lower a rule-based finding.
      severity: existing?.severity === "high" || it.severity === "high" ? "high" : "moderate",
      title: `${a.input.name} + ${b.input.name}: ${it.title}`,
      explanation: it.explanation,
      meds: [a.input.id, b.input.id],
      evidence: [...ev, ...(existing?.evidence ?? []).filter((e) => !ev.some((x) => norm(x.quote) === norm(e.quote)))].slice(0, 4),
      basis: "ai-reviewed-label",
      action: it.action,
    };
    if (existing) findings[findings.indexOf(existing)] = merged;
    else findings.push(merged);
  }

  for (const ins of out.instructions) {
    const m = byId.get(ins.medId);
    if (!m) continue;
    findings.push({
      id: `ins-${m.input.id}`,
      kind: "instructions",
      severity: "info",
      title: `${m.input.name}: unclear directions`,
      explanation: ins.issue,
      meds: [m.input.id],
      evidence: [],
      basis: "ai-read-instructions",
      action: ins.clarification,
    });
  }

  return { result: { ...result, findings: sortFindings(findings), aiReviewed: true }, summary: out.summary, rejected };
}
