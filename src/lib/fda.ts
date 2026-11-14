// FDA drug labels via openFDA (free, no key needed at hackathon volumes).
export type Label = {
  ingredient: string;
  title: string;
  setId: string | null;
  url: string | null;
  /** Interaction-relevant sections only, keyed by readable section name */
  sections: Record<string, string>;
};

const OPENFDA = "https://api.fda.gov/drug/label.json";
const SECTIONS: Record<string, string> = {
  boxed_warning: "Boxed warning",
  contraindications: "Contraindications",
  drug_interactions: "Drug interactions",
  warnings_and_cautions: "Warnings and precautions",
  warnings: "Warnings",
  precautions: "Precautions",
  do_not_use: "Do not use",
  ask_doctor_or_pharmacist: "Ask a doctor or pharmacist before use if you are",
  stop_use: "Stop use and ask a doctor if",
};

type FdaResult = { set_id?: string; openfda?: { generic_name?: string[]; brand_name?: string[] } } & Record<string, unknown>;
const cache = new Map<string, Promise<Label | null>>();

async function search(q: string): Promise<FdaResult[]> {
  const r = await fetch(`${OPENFDA}?search=${encodeURIComponent(q)}&limit=10`, { signal: AbortSignal.timeout(12000) });
  if (r.status === 404) return []; // openFDA returns 404 for "no matches"
  if (!r.ok) throw new Error(`openFDA ${r.status}`);
  return ((await r.json()) as { results?: FdaResult[] }).results ?? [];
}

/** Best label for a single ingredient: prefer a single-ingredient label with an interactions section. */
export function getLabel(ingredient: string): Promise<Label | null> {
  const key = ingredient.toLowerCase();
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const name = key.replace(/"/g, "");
      // Only ever use a label for THIS ingredient alone. A combination product's label
      // (e.g. hydrocodone + acetaminophen) would attribute its other drug's warnings to this one.
      const salt = / (sodium|hydrochloride|hcl|potassium|succinate|tartrate|calcium|hydrobromide|maleate|besylate|mesylate)$/;
      const single = (r: FdaResult) =>
        (r.openfda?.generic_name ?? []).some((g) => g.toLowerCase().trim().replace(salt, "") === name) &&
        ((r.openfda as { substance_name?: string[] } | undefined)?.substance_name?.length ?? 1) === 1;
      const SALTS = ["", " HYDROCHLORIDE", " HCL", " SODIUM", " POTASSIUM", " SUCCINATE", " TARTRATE", " HYDROBROMIDE", " MALEATE", " BESYLATE", " CALCIUM"];
      const exact = SALTS.map((s) => `openfda.generic_name.exact:"${name.toUpperCase()}${s}"`).join(" ");
      // Labels with more interaction-related sections are more useful.
      const richness = (r: FdaResult) => Object.keys(SECTIONS).filter((k) => Array.isArray(r[k])).length;
      let best: FdaResult | undefined;
      // Prefer labels for medicines taken by mouth: patients have pills and syrups, not IV bags.
      for (const q of [
        `(${exact}) AND openfda.route:"ORAL" AND _exists_:drug_interactions`,
        `(${exact}) AND openfda.route:"ORAL"`,
        `(${exact}) AND _exists_:drug_interactions`,
        exact,
        `openfda.generic_name:"${name}"`,
        `openfda.substance_name:"${name}"`,
      ]) {
        best = (await search(q)).filter(single).sort((a, b) => richness(b) - richness(a))[0];
        if (best) break;
      }
      if (!best) return null;
      const sections: Record<string, string> = {};
      for (const [k, label] of Object.entries(SECTIONS)) {
        const v = best[k];
        if (Array.isArray(v) && v.length) sections[label] = (v as string[]).join(" ").replace(/\s+/g, " ").trim();
      }
      const brand = best.openfda?.brand_name?.[0];
      const generic = best.openfda?.generic_name?.[0];
      return {
        ingredient: key,
        title: [brand, generic && generic.toLowerCase() !== brand?.toLowerCase() ? `(${generic.toLowerCase()})` : ""].filter(Boolean).join(" ") || name,
        setId: best.set_id ?? null,
        url: best.set_id ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${best.set_id}` : null,
        sections,
      };
    })().catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key)!;
}
