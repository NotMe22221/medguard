import type { CheckResult, Finding, MedInput } from "./types";
import { resolveMed } from "./resolve";
import { getLabel, type Label } from "./fda";
import { duplicateIngredients, labelFindings, sameClass, sortFindings } from "./checks";

/** Everything that doesn't need AI: RxNorm matching, duplicates, classes, FDA label evidence. */
export async function runDeterministic(inputs: MedInput[]) {
  const meds = await Promise.all(inputs.map(resolveMed));
  const ingredients = [...new Set(meds.flatMap((m) => m.ingredients.map((i) => i.name)))];
  const labels = new Map<string, Label>();
  const warnings: string[] = [];
  await Promise.all(
    ingredients.map(async (ing) => {
      try {
        const l = await getLabel(ing);
        if (l) labels.set(ing, l);
      } catch (e) {
        console.error(`[openFDA] ${ing}:`, e);
        warnings.push(`Couldn't reach the FDA label service for ${ing}.`);
      }
    })
  );
  for (const m of meds) if (m.unresolved) warnings.push(`Couldn't identify "${m.input.name}". Check the spelling or scan the label.`);

  const { findings: labelF, pairs } = labelFindings(meds, labels);
  const findings: Finding[] = [...duplicateIngredients(meds), ...sameClass(meds), ...labelF];
  const result: CheckResult = {
    meds,
    findings: sortFindings(findings),
    checkedPairs: pairs,
    labelsFound: labels.size,
    aiReviewed: false,
    warnings,
  };
  return { result, labels };
}
