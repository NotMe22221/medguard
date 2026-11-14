// RxNorm / RxClass lookups (U.S. National Library of Medicine, free, no key).
import type { Ingredient } from "./types";

const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const cache = new Map<string, Promise<unknown>>();

async function getJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url, { signal: AbortSignal.timeout(12000) }).then((r) => {
        if (!r.ok) throw new Error(`RxNav ${r.status}`);
        return r.json();
      }).catch((e) => { cache.delete(url); throw e; })
    );
  }
  return cache.get(url) as Promise<T>;
}

type Related = { relatedGroup?: { conceptGroup?: { tty: string; conceptProperties?: { rxcui: string; name: string }[] }[] } };

/** Match a free-text product name ("Advil", "metoprolol succinate 25") to an RxNorm concept. */
export async function matchProduct(term: string): Promise<{ rxcui: string; name: string } | null> {
  const q = encodeURIComponent(term.trim());
  const j = await getJson<{ approximateGroup?: { candidate?: { rxcui: string; score: string }[] } }>(
    `${RXNAV}/approximateTerm.json?term=${q}&maxEntries=1&option=1`
  );
  const c = j.approximateGroup?.candidate?.[0];
  if (!c || parseFloat(c.score) < 3) return null;
  const p = await getJson<{ properties?: { rxcui: string; name: string } }>(`${RXNAV}/rxcui/${c.rxcui}/properties.json`);
  return p.properties ? { rxcui: p.properties.rxcui, name: p.properties.name } : null;
}

/** Active ingredients of a product concept. */
export async function ingredientsOf(rxcui: string): Promise<{ name: string; rxcui: string }[]> {
  const j = await getJson<Related>(`${RXNAV}/rxcui/${rxcui}/related.json?tty=IN`);
  const ins = j.relatedGroup?.conceptGroup?.flatMap((g) => g.conceptProperties ?? []) ?? [];
  return ins.map((c) => ({ name: c.name.toLowerCase(), rxcui: c.rxcui }));
}

/** Normalize an ingredient name read off a label ("Acetaminophen 325 mg", "doxylamine succinate"). */
export async function resolveIngredient(name: string): Promise<{ name: string; rxcui: string } | null> {
  const clean = name.toLowerCase().replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|%)\b/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const exact = await getJson<{ idGroup?: { rxnormId?: string[] } }>(`${RXNAV}/rxcui.json?name=${encodeURIComponent(clean)}&search=2`);
  const id = exact.idGroup?.rxnormId?.[0];
  if (!id) return null;
  // Salts (e.g. "doxylamine succinate") map to their base ingredient.
  const props = await getJson<{ properties?: { tty: string; name: string } }>(`${RXNAV}/rxcui/${id}/properties.json`);
  if (props.properties?.tty === "IN") return { name: props.properties.name.toLowerCase(), rxcui: id };
  const base = await ingredientsOf(id);
  return base[0] ?? (props.properties ? { name: props.properties.name.toLowerCase(), rxcui: id } : null);
}

/** FDA "Established Pharmacologic Class" names, e.g. "Nonsteroidal Anti-inflammatory Drug". */
export async function classesOf(ingredientRxcui: string): Promise<string[]> {
  try {
    const j = await getJson<{ rxclassDrugInfoList?: { rxclassDrugInfo?: { rxclassMinConceptItem: { className: string } }[] } }>(
      `${RXNAV}/rxclass/class/byRxcui.json?rxcui=${ingredientRxcui}&relaSource=DAILYMED&relas=has_EPC`
    );
    return [...new Set(j.rxclassDrugInfoList?.rxclassDrugInfo?.map((x) => x.rxclassMinConceptItem.className) ?? [])];
  } catch {
    return [];
  }
}

export async function enrich(ings: { name: string; rxcui: string | null; strengthMg: number | null }[]): Promise<Ingredient[]> {
  return Promise.all(ings.map(async (i) => ({ ...i, classes: i.rxcui ? await classesOf(i.rxcui) : [] })));
}
