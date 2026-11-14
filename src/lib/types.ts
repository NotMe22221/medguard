/** A medication as the user entered or scanned it. */
export type MedInput = {
  id: string;
  /** Product name as written, e.g. "NyQuil Cold & Flu" or "Eliquis 5 mg" */
  name: string;
  /** Active ingredients read from the label. Empty when typed by hand (we look them up). */
  ingredients: { name: string; strengthMg: number | null }[];
  /** Units (tablets, capsules, mL...) per dose, if known */
  unitsPerDose: number | null;
  /** Most doses allowed or prescribed per 24 h, if known */
  maxDosesPerDay: number | null;
  /** Directions as written on the label */
  directions: string;
  source: "scan" | "typed" | "sample";
};

export type Ingredient = { name: string; rxcui: string | null; strengthMg: number | null; classes: string[] };

/** A medication after it has been matched to RxNorm. */
export type ResolvedMed = {
  input: MedInput;
  matchedName: string | null;
  rxcui: string | null;
  ingredients: Ingredient[];
  unresolved: boolean;
};

export type Severity = "high" | "moderate" | "info";

export type Evidence = {
  /** Exact sentence from the FDA label (verified to exist in the label text) */
  quote: string;
  labelTitle: string;
  section: string;
  url: string | null;
};

export type Finding = {
  id: string;
  kind: "duplicate-ingredient" | "daily-limit" | "same-class" | "interaction" | "instructions";
  severity: Severity;
  title: string;
  explanation: string;
  /** Med ids involved */
  meds: string[];
  evidence: Evidence[];
  /** What the finding was based on */
  basis: "rxnorm" | "fda-label" | "ai-reviewed-label" | "ai-read-instructions";
  action: string;
};

export type CheckResult = {
  meds: ResolvedMed[];
  findings: Finding[];
  checkedPairs: number;
  labelsFound: number;
  aiReviewed: boolean;
  warnings: string[];
};
