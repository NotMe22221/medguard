"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckResult, MedInput } from "@/lib/types";
import { SAMPLE_CABINET } from "@/lib/sample";
import AddMed from "./AddMed";
import Results from "./Results";

type Response = { result: CheckResult; summary: string; rejected: number };
const STEPS = ["Matching names to RxNorm", "Finding active ingredients", "Reading FDA labels", "Checking every pair", "Writing your summary"];

export default function MedGuardApp() {
  const [meds, setMeds] = useState<MedInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [res, setRes] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1600);
    return () => clearInterval(id);
  }, [loading]);

  async function check() {
    setLoading(true);
    setStep(0);
    setError(null);
    setRes(null);
    try {
      const r = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meds }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Check failed");
      setRes(j);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }

  const remove = (id: string) => { setMeds((m) => m.filter((x) => x.id !== id)); setRes(null); };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20">
      <nav className="flex items-center justify-between py-5 no-print">
        <span className="flex items-center gap-2 font-display text-2xl">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white text-base">✚</span> MedGuard
        </span>
        <span className="text-sm text-ink-soft hidden sm:block">Medication safety, backed by FDA data</span>
      </nav>

      <section className="pt-6 pb-10 sm:pt-10 max-w-3xl no-print">
        <h1 className="font-display text-5xl sm:text-6xl leading-[1.02] tracking-tight">
          Are your medicines <span className="italic text-brand">safe together?</span>
        </h1>
        <p className="mt-5 text-lg text-ink-soft">
          Snap a photo of each label. MedGuard finds hidden duplicate ingredients, risky combinations and confusing
          directions. Every warning shows the exact words of the official FDA label, so you can trust it and show it to your pharmacist.
        </p>
      </section>

      <div className="grid lg:grid-cols-[380px_1fr] gap-8 items-start">
        <aside className="lg:sticky lg:top-4 space-y-4 no-print">
          <div className="rounded-3xl bg-card border border-line p-5 shadow-[0_20px_50px_-30px_rgba(19,42,42,0.35)]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Your medicines</h2>
              <span className="text-sm text-ink-soft">{meds.length}</span>
            </div>
            <p className="text-sm text-ink-soft mt-1">Include over-the-counter pills, cold medicine, and supplements.</p>

            {meds.length > 0 && (
              <ul className="mt-4 space-y-2">
                {meds.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 rounded-xl bg-paper px-3 py-2.5">
                    <span className="mt-0.5 text-lg" aria-hidden>{m.source === "scan" ? "📷" : "💊"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{m.name}</p>
                      {m.ingredients.length > 0 && <p className="text-xs text-ink-soft truncate">{m.ingredients.map((i) => i.name.toLowerCase()).join(", ")}</p>}
                    </div>
                    <button onClick={() => remove(m.id)} aria-label={`Remove ${m.name}`} className="text-ink-soft hover:text-high px-1">✕</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4">
              <AddMed onAdd={(m) => { setMeds((x) => [...x, m]); setRes(null); }} />
            </div>

            <button
              onClick={check}
              disabled={!meds.length || loading}
              className="mt-4 w-full rounded-2xl bg-ink text-white py-4 text-lg font-semibold disabled:opacity-40 hover:brightness-125 transition"
            >
              {loading ? "Checking…" : "Check for problems"}
            </button>
            {meds.length === 0 && (
              <button onClick={() => { setMeds(SAMPLE_CABINET.map((m) => ({ ...m }))); setRes(null); }}
                className="mt-3 w-full rounded-2xl border border-line py-3 text-sm font-medium hover:bg-paper">
                Try a sample medicine cabinet
              </button>
            )}
          </div>
        </aside>

        <div ref={resultsRef} className="scroll-mt-4 min-w-0">
          {error && <p role="alert" className="rounded-2xl bg-high-soft text-high p-4">{error}</p>}
          {loading && (
            <div className="rounded-3xl bg-card border border-line p-8">
              <p className="font-display text-2xl">Checking {meds.length} medicines…</p>
              <ol className="mt-5 space-y-3">
                {STEPS.map((s, i) => (
                  <li key={s} className={`flex items-center gap-3 ${i > step ? "text-ink-soft/50" : ""}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i < step ? "bg-brand text-white" : i === step ? "border-2 border-brand border-t-transparent animate-spin" : "border border-line"}`}>
                      {i < step ? "✓" : ""}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {res && !loading && <Results data={res.result} summary={res.summary} rejected={res.rejected} />}
          {!res && !loading && !error && <HowItWorks />}
        </div>
      </div>
    </main>
  );
}

function HowItWorks() {
  const items = [
    ["Hidden duplicates", "Tylenol and NyQuil both contain acetaminophen. Taking both can quietly pass the daily limit. Acetaminophen overdose is a leading cause of acute liver failure in the U.S."],
    ["Risky combinations", "Checked against the official FDA label of every ingredient. You see the exact sentence, with a link to the label."],
    ["Confusing directions", "“Take as directed” or “1–2 tablets every 4–6 hours” become clear questions to ask."],
  ];
  return (
    <div className="space-y-4">
      {items.map(([t, d], i) => (
        <div key={t} className="rounded-3xl bg-card border border-line p-6 flex gap-5">
          <span className="font-display text-4xl text-brand leading-none">{i + 1}</span>
          <div><h3 className="font-semibold text-lg">{t}</h3><p className="text-ink-soft mt-1">{d}</p></div>
        </div>
      ))}
      <div className="rounded-3xl bg-brand-soft p-6">
        <h3 className="font-semibold">Why you can trust it</h3>
        <p className="text-sm mt-1 text-ink">
          Ingredients come from <b>RxNorm</b> (U.S. National Library of Medicine). Warnings come from <b>FDA drug labels</b>.
          AI only reads photos and explains in plain words, and any AI claim whose quote isn&apos;t found word-for-word in the label is thrown out.
        </p>
      </div>
    </div>
  );
}
