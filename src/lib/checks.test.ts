import { describe, expect, it } from "vitest";
import { duplicateIngredients, labelMentions, labelFindings, norm, sameClass, sentences } from "./checks";
import type { Label } from "./fda";
import type { ResolvedMed } from "./types";

const med = (id: string, ings: [string, number | null, string[]?][], unitsPerDose: number | null = 1, maxDosesPerDay: number | null = 4): ResolvedMed => ({
  input: { id, name: id, ingredients: [], unitsPerDose, maxDosesPerDay, directions: "", source: "sample" },
  matchedName: null,
  rxcui: null,
  ingredients: ings.map(([name, strengthMg, classes = []]) => ({ name, rxcui: "1", strengthMg, classes })),
  unresolved: false,
});

describe("duplicate ingredients", () => {
  it("finds the same ingredient in two products and totals the daily dose", () => {
    const tylenol = med("Tylenol", [["acetaminophen", 500]], 2, 3); // 3,000 mg
    const nyquil = med("NyQuil", [["acetaminophen", 650], ["doxylamine", 12.5]], 1, 4); // 2,600 mg
    const [f] = duplicateIngredients([tylenol, nyquil]);
    expect(f).toMatchObject({ kind: "duplicate-ingredient", severity: "high" });
    expect(f.explanation).toMatch(/both contain acetaminophen/);
    expect(f.explanation).toMatch(/5,600 mg a day, over the 4,000 mg limit/);
  });
  it("still warns when doses are unknown, without inventing a total", () => {
    const [f] = duplicateIngredients([med("A", [["acetaminophen", null]]), med("B", [["acetaminophen", null]])]);
    expect(f.severity).toBe("high");
    expect(f.explanation).not.toMatch(/mg a day/);
  });
  it("flags a single product above its daily limit", () => {
    const [f] = duplicateIngredients([med("Advil", [["ibuprofen", 200]], 2, 6)]); // 2,400 mg
    expect(f).toMatchObject({ kind: "daily-limit", severity: "high" });
  });
  it("stays quiet for one product within its limit", () => {
    expect(duplicateIngredients([med("Advil", [["ibuprofen", 200]], 1, 6)])).toEqual([]);
  });
});

describe("same class", () => {
  it("flags two different NSAIDs as high", () => {
    const f = sameClass([med("Advil", [["ibuprofen", 200, ["Nonsteroidal Anti-inflammatory Drug"]]]), med("Aleve", [["naproxen", 220, ["Nonsteroidal Anti-inflammatory Drug"]]])]);
    expect(f[0]).toMatchObject({ kind: "same-class", severity: "high" });
  });
  it("ignores one product listed once", () => {
    expect(sameClass([med("Advil", [["ibuprofen", 200, ["Nonsteroidal Anti-inflammatory Drug"]]])])).toEqual([]);
  });
});

describe("label evidence", () => {
  const apixaban = med("Eliquis", [["apixaban", 5, ["Factor Xa Inhibitor"]]]);
  const advil = med("Advil", [["ibuprofen", 200, ["Nonsteroidal Anti-inflammatory Drug"]]]);
  const metoprolol = med("Metoprolol", [["metoprolol", 25, ["beta-Adrenergic Blocker"]]]);
  const ibuLabel: Label = {
    ingredient: "ibuprofen", title: "Ibuprofen", setId: "x", url: "https://example.org",
    sections: {
      Warnings: "Bleeding has been reported in patients receiving anticoagulants. Use caution. Ibuprofen had no effect on the beta-blocking ability of beta blockers in a study.",
    },
  };

  it("finds sentences that mention the other drug's class", () => {
    const ev = labelMentions(advil, ibuLabel, apixaban);
    expect(ev).toHaveLength(1);
    expect(ev[0].quote).toBe("Bleeding has been reported in patients receiving anticoagulants.");
  });
  it("ignores sentences that say there is no interaction", () => {
    expect(labelMentions(advil, ibuLabel, metoprolol)).toEqual([]);
  });
  it("turns label mentions into a high-severity pair finding", () => {
    const { findings, pairs } = labelFindings([advil, apixaban], new Map([["ibuprofen", ibuLabel]]));
    expect(pairs).toBe(1);
    expect(findings[0]).toMatchObject({ kind: "interaction", severity: "high", basis: "fda-label" });
  });
  it("does not split on abbreviations like St.", () => {
    expect(sentences("Avoid St. John's wort with this drug. Another sentence here please.")).toEqual([
      "Avoid St. John's wort with this drug.",
      "Another sentence here please.",
    ]);
  });
  it("normalizes quotes for verification", () => {
    expect(norm("“Bleeding”  has\nbeen reported")).toBe('"bleeding" has been reported');
  });
});
