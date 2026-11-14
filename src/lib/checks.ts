// Deterministic safety checks. No AI here: every finding comes from RxNorm data,
// published daily limits, or an exact sentence in an FDA label.
import type { Evidence, Finding, ResolvedMed, Severity } from "./types";
import type { Label } from "./fda";

/** Maximum daily amounts printed on U.S. OTC Drug Facts labels (mg per 24 h, adults). */
export const DAILY_MAX_MG: Record<string, { mg: number; note: string }> = {
  acetaminophen: { mg: 4000, note: "FDA maximum for adults; many labels and doctors advise 3,000 mg" },
  ibuprofen: { mg: 1200, note: "OTC label maximum unless a doctor directs more" },
  naproxen: { mg: 660, note: "OTC label maximum (naproxen sodium) unless a doctor directs more" },
  aspirin: { mg: 4000, note: "OTC label maximum for pain relief" },
  diphenhydramine: { mg: 300, note: "OTC label maximum" },
  dextromethorphan: { mg: 120, note: "OTC label maximum" },
};

/** Plain words that labels use for each FDA pharmacologic class. */
export const CLASS_TERMS: Record<string, string[]> = {
  "Nonsteroidal Anti-inflammatory Drug": ["NSAID", "NSAIDs", "nonsteroidal anti-inflammatory", "non-steroidal anti-inflammatory"],
  "Factor Xa Inhibitor": ["anticoagulant", "anticoagulants", "anticoagulation", "blood thinner", "thinning the blood"],
  "Vitamin K Antagonist": ["anticoagulant", "anticoagulants", "anticoagulation", "blood thinner", "thinning the blood"],
  "Direct Thrombin Inhibitor": ["anticoagulant", "anticoagulants", "anticoagulation", "blood thinner", "thinning the blood"],
  "P2Y12 Platelet Inhibitor": ["antiplatelet", "platelet inhibitor", "platelet inhibitors"],
  "Platelet Aggregation Inhibitor": ["antiplatelet", "platelet aggregation"],
  "Selective Serotonin Reuptake Inhibitor": ["SSRI", "SSRIs", "selective serotonin reuptake inhibitor", "selective serotonin reuptake inhibitors"],
  "Serotonin Reuptake Inhibitor": ["SSRI", "SSRIs", "selective serotonin reuptake inhibitor", "selective serotonin reuptake inhibitors", "serotonin reuptake"],
  "Serotonin and Norepinephrine Reuptake Inhibitor": ["SNRI", "SNRIs", "serotonin and norepinephrine reuptake inhibitor"],
  "Monoamine Oxidase Inhibitor": ["MAOI", "MAOIs", "monoamine oxidase inhibitor"],
  "Opioid Agonist": ["opioid", "opioids", "CNS depressant", "CNS depressants"],
  "Benzodiazepine": ["benzodiazepine", "benzodiazepines", "CNS depressant", "CNS depressants", "sedatives"],
  "Histamine-1 Receptor Antagonist": ["antihistamine", "antihistamines", "sedatives", "tranquilizers"],
  Antihistamine: ["antihistamine", "antihistamines", "sedatives", "tranquilizers"],
  "Angiotensin Converting Enzyme Inhibitor": ["ACE inhibitor", "ACE inhibitors", "angiotensin-converting enzyme"],
  "Angiotensin 2 Receptor Blocker": ["angiotensin receptor blocker", "ARBs", "ARB"],
  "Aldosterone Antagonist": ["potassium-sparing", "aldosterone antagonist"],
  "beta-Adrenergic Blocker": ["beta blocker", "beta blockers", "beta-blocker", "beta-blockers", "beta-adrenergic blocking"],
  "HMG-CoA Reductase Inhibitor": ["statin", "statins", "HMG-CoA reductase inhibitor"],
  "Thiazide Diuretic": ["diuretic", "diuretics", "thiazide"],
  "Loop Diuretic": ["diuretic", "diuretics", "loop diuretic"],
  "Corticosteroid": ["corticosteroid", "corticosteroids"],
  "Sulfonylurea": ["sulfonylurea", "sulfonylureas", "hypoglycemic"],
  "Biguanide": ["metformin"],
};

/** Classes where taking two different drugs of the same class is usually a mistake. */
const RISKY_DOUBLE = new Set([
  "Nonsteroidal Anti-inflammatory Drug", "Factor Xa Inhibitor", "Vitamin K Antagonist", "Direct Thrombin Inhibitor",
  "Opioid Agonist", "Benzodiazepine", "Selective Serotonin Reuptake Inhibitor", "Serotonin and Norepinephrine Reuptake Inhibitor",
  "Monoamine Oxidase Inhibitor", "Histamine-1 Receptor Antagonist", "Antihistamine", "Serotonin Reuptake Inhibitor",
]);

const label = (m: ResolvedMed) => m.input.name;
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function dailyMg(m: ResolvedMed, ingredient: string): number | null {
  const ing = m.ingredients.find((i) => i.name === ingredient);
  if (!ing?.strengthMg || !m.input.unitsPerDose || !m.input.maxDosesPerDay) return null;
  return ing.strengthMg * m.input.unitsPerDose * m.input.maxDosesPerDay;
}

/** Same active ingredient in more than one product, and combined daily totals. */
export function duplicateIngredients(meds: ResolvedMed[]): Finding[] {
  const by = new Map<string, ResolvedMed[]>();
  for (const m of meds) for (const i of m.ingredients) {
    const arr = by.get(i.name) ?? [];
    if (!arr.includes(m)) arr.push(m);
    by.set(i.name, arr);
  }
  const out: Finding[] = [];
  for (const [ing, ms] of by) {
    const limit = DAILY_MAX_MG[ing];
    const totals = ms.map((m) => dailyMg(m, ing));
    const known = totals.every((t) => t !== null);
    const total = totals.reduce<number>((a, b) => a + (b ?? 0), 0);

    if (ms.length > 1) {
      const over = limit && known && total > limit.mg;
      out.push({
        id: `dup-${ing}`,
        kind: "duplicate-ingredient",
        severity: over || limit ? "high" : "moderate",
        title: `${cap(ing)} is in ${ms.length} of your medicines`,
        explanation:
          `${list(ms.map(label))} ${ms.length === 2 ? "both" : "all"} contain ${ing}. Taking them together doubles up on the same drug, which is a common cause of accidental overdose.` +
          (limit && known ? ` At the most each label allows, that adds up to ${total.toLocaleString()} mg a day${over ? `, over the ${limit.mg.toLocaleString()} mg limit` : ""} (${limit.note}).` : ""),
        meds: ms.map((m) => m.input.id),
        evidence: [],
        basis: "rxnorm",
        action: `Don't take these at the same time without asking a pharmacist. Use only one product that contains ${ing}.`,
      });
    } else if (limit && known && total > limit.mg) {
      out.push({
        id: `limit-${ing}`,
        kind: "daily-limit",
        severity: "high",
        title: `${cap(ing)} dose is above the daily limit`,
        explanation: `As entered, ${label(ms[0])} adds up to ${total.toLocaleString()} mg of ${ing} a day, over the ${limit.mg.toLocaleString()} mg limit (${limit.note}).`,
        meds: [ms[0].input.id],
        evidence: [],
        basis: "rxnorm",
        action: "Check the dose with your pharmacist or doctor.",
      });
    }
  }
  return out;
}

/** Two different drugs from the same risky class (e.g. two NSAIDs, two blood thinners). */
export function sameClass(meds: ResolvedMed[]): Finding[] {
  const by = new Map<string, { med: ResolvedMed; ing: string }[]>();
  for (const m of meds) for (const i of m.ingredients) for (const c of i.classes) {
    const arr = by.get(c) ?? [];
    if (!arr.some((x) => x.ing === i.name)) arr.push({ med: m, ing: i.name });
    by.set(c, arr);
  }
  const out: Finding[] = [];
  for (const [cls, items] of by) {
    const meds2 = [...new Set(items.map((x) => x.med))];
    if (items.length < 2 || meds2.length < 2) continue;
    const risky = RISKY_DOUBLE.has(cls);
    out.push({
      id: `class-${cls}`,
      kind: "same-class",
      severity: risky ? "high" : "moderate",
      title: `Two ${cls.toLowerCase()}s`,
      explanation: `${list(items.map((x) => x.ing))} are both in the FDA class "${cls}". Taking two drugs that work the same way adds up their side effects.`,
      meds: meds2.map((m) => m.input.id),
      evidence: [],
      basis: "rxnorm",
      action: risky ? "Ask your pharmacist whether you should be taking both." : "Mention both to your pharmacist.",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Label evidence                                                      */
/* ------------------------------------------------------------------ */

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    // Split at sentence ends, but not after abbreviations like "St." or "e.g.".
    .split(/(?<!\b(?:St|Dr|vs|approx|Fig|No|e\.g|i\.e)\.)(?<=[.!?;•])\s+(?=[A-Z(•])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 600);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words that identify a drug inside another drug's label. */
export function termsFor(m: ResolvedMed): string[] {
  const t = new Set<string>();
  for (const i of m.ingredients) {
    t.add(i.name);
    for (const c of i.classes) for (const w of CLASS_TERMS[c] ?? []) t.add(w);
  }
  return [...t].filter((x) => x.length > 2);
}

/** Sentences that mention a drug only to say there is NO interaction. */
const REASSURING = /\b(?:no|not)\s+(?:\w+\s+){0,3}(?:effect|affect|alter|change|interaction|influence)|no dose adjustment|did not (?:alter|affect|change)/i;

const SERIOUS = /contraindicat|do not use|avoid|fatal|life-threatening|serious|bleeding|hemorrhag|respiratory depression|serotonin syndrome|hyperkalemia|stomach bleeding/i;

/** Sentences in A's label that mention B (by ingredient name or drug class). */
export function labelMentions(a: ResolvedMed, aLabel: Label, b: ResolvedMed): Evidence[] {
  const own = new Set(a.ingredients.map((i) => i.name));
  const terms = termsFor(b).filter((t) => !own.has(t));
  if (!terms.length) return [];
  const re = new RegExp(`\\b(${terms.map(escapeRe).join("|")})\\b`, "i");
  const out: Evidence[] = [];
  for (const [section, text] of Object.entries(aLabel.sections)) {
    for (const s of sentences(text)) {
      if (re.test(s) && !REASSURING.test(s)) out.push({ quote: s, labelTitle: aLabel.title, section, url: aLabel.url });
    }
  }
  // Most serious first, at most 3 per direction.
  return out.sort((x, y) => Number(SERIOUS.test(y.quote)) - Number(SERIOUS.test(x.quote))).slice(0, 3);
}

export function labelFindings(meds: ResolvedMed[], labels: Map<string, Label>): { findings: Finding[]; pairs: number } {
  const out: Finding[] = [];
  let pairs = 0;
  for (let i = 0; i < meds.length; i++) for (let j = i + 1; j < meds.length; j++) {
    const a = meds[i], b = meds[j];
    pairs++;
    const ev: Evidence[] = [];
    for (const [x, y] of [[a, b], [b, a]] as const) {
      for (const ing of x.ingredients) {
        const l = labels.get(ing.name);
        if (l) ev.push(...labelMentions(x, l, y));
      }
    }
    const unique = ev.filter((e, k) => ev.findIndex((f) => f.quote === e.quote) === k).slice(0, 4);
    if (!unique.length) continue;
    const severity: Severity = unique.some((e) => SERIOUS.test(e.quote)) ? "high" : "moderate";
    out.push({
      id: `label-${a.input.id}-${b.input.id}`,
      kind: "interaction",
      severity,
      title: `${label(a)} + ${label(b)}`,
      explanation: `The official FDA label warns about using these together. Read the exact wording below.`,
      meds: [a.input.id, b.input.id],
      evidence: unique,
      basis: "fda-label",
      action: severity === "high" ? "Ask your pharmacist or doctor before taking these together." : "Mention this combination to your pharmacist.",
    });
  }
  return { findings: out, pairs };
}

const RANK: Record<Severity, number> = { high: 0, moderate: 1, info: 2 };
export function sortFindings(f: Finding[]) {
  return [...f].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/** Normalize for quote verification: case, whitespace, and typographic quotes. */
export function norm(s: string) {
  return s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}
