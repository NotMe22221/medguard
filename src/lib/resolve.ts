import type { MedInput, ResolvedMed } from "./types";
import { enrich, ingredientsOf, matchProduct, resolveIngredient } from "./rxnorm";

/** Map a med to RxNorm: label ingredients when scanned, product-name search when typed. */
export async function resolveMed(input: MedInput): Promise<ResolvedMed> {
  if (input.ingredients.length) {
    const ings = await Promise.all(
      input.ingredients.map(async (i) => {
        const r = await resolveIngredient(i.name).catch((e) => { console.error(`[RxNorm] ${i.name}:`, e); return null; });
        return { name: r?.name ?? i.name.toLowerCase().trim(), rxcui: r?.rxcui ?? null, strengthMg: i.strengthMg };
      })
    );
    return {
      input,
      matchedName: null,
      rxcui: null,
      ingredients: await enrich(ings),
      unresolved: ings.every((i) => !i.rxcui),
    };
  }
  const match = await matchProduct(input.name).catch(() => null);
  if (!match) return { input, matchedName: null, rxcui: null, ingredients: [], unresolved: true };
  const ins = await ingredientsOf(match.rxcui).catch(() => []);
  // Typed names carry a strength like "25 mg" only for single-ingredient products.
  const m = input.name.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  const strength = m && ins.length === 1 ? parseFloat(m[1]) : null;
  return {
    input,
    matchedName: match.name,
    rxcui: match.rxcui,
    ingredients: await enrich(ins.map((i) => ({ ...i, strengthMg: strength }))),
    unresolved: ins.length === 0,
  };
}
