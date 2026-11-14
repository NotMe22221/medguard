// Hits the real RxNorm and openFDA services. Run with: LIVE=1 npx vitest run src/lib/live.test.ts
import { describe, expect, it } from "vitest";
import { runDeterministic } from "./pipeline";
import { SAMPLE_CABINET } from "./sample";

describe.skipIf(!process.env.LIVE)("live data sources", () => {
  it("finds the expected problems in the sample cabinet", async () => {
    const { result } = await runDeterministic(SAMPLE_CABINET);
    expect(result.warnings).toEqual([]);
    expect(result.labelsFound).toBe(7);
    const titles = result.findings.map((f) => f.title);
    expect(titles).toContain("Acetaminophen is in 2 of your medicines");
    expect(titles).toContain("Eliquis 5 mg + Advil");
    expect(titles).toContain("Eliquis 5 mg + Sertraline 50 mg");
    expect(titles).toContain("Sertraline 50 mg + Advil");
    // Regression: no warnings borrowed from combination-product labels, no "no effect" sentences.
    expect(titles).not.toContain("Tylenol Extra Strength + NyQuil Cold & Flu");
    expect(titles).not.toContain("Sertraline 50 mg + Metoprolol succinate ER 25 mg");
    for (const f of result.findings) for (const e of f.evidence) expect(e.quote.length).toBeGreaterThan(15);
  });
});
