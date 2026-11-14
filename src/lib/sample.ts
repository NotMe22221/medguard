import type { MedInput } from "./types";

// A realistic medicine cabinet for an older adult on a blood thinner who caught a cold.
// Ingredient amounts and directions follow the products' U.S. Drug Facts / Rx labels.
export const SAMPLE_CABINET: MedInput[] = [
  {
    id: "s1", name: "Eliquis 5 mg", source: "sample",
    ingredients: [{ name: "apixaban", strengthMg: 5 }],
    unitsPerDose: 1, maxDosesPerDay: 2, directions: "Take 1 tablet by mouth twice daily.",
  },
  {
    id: "s2", name: "Sertraline 50 mg", source: "sample",
    ingredients: [{ name: "sertraline", strengthMg: 50 }],
    unitsPerDose: 1, maxDosesPerDay: 1, directions: "Take 1 tablet by mouth daily.",
  },
  {
    id: "s3", name: "Advil", source: "sample",
    ingredients: [{ name: "ibuprofen", strengthMg: 200 }],
    unitsPerDose: 1, maxDosesPerDay: 6,
    directions: "Take 1 tablet every 4 to 6 hours while symptoms persist. If pain or fever does not respond to 1 tablet, 2 tablets may be used. Do not exceed 6 tablets in 24 hours, unless directed by a doctor.",
  },
  {
    id: "s4", name: "Tylenol Extra Strength", source: "sample",
    ingredients: [{ name: "acetaminophen", strengthMg: 500 }],
    unitsPerDose: 2, maxDosesPerDay: 3,
    directions: "Take 2 caplets every 6 hours while symptoms last. Do not take more than 6 caplets in 24 hours, unless directed by a doctor.",
  },
  {
    id: "s5", name: "NyQuil Cold & Flu", source: "sample",
    ingredients: [
      { name: "acetaminophen", strengthMg: 650 },
      { name: "dextromethorphan hydrobromide", strengthMg: 30 },
      { name: "doxylamine succinate", strengthMg: 12.5 },
    ],
    unitsPerDose: 1, maxDosesPerDay: 4,
    directions: "Take 30 mL in dose cup provided every 6 hours. Do not exceed 4 doses per 24 hours.",
  },
  {
    id: "s6", name: "Metoprolol succinate ER 25 mg", source: "sample",
    ingredients: [{ name: "metoprolol succinate", strengthMg: 25 }],
    unitsPerDose: 1, maxDosesPerDay: 1, directions: "Take as directed.",
  },
];
