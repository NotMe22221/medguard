"use client";

import type { CheckResult, Finding, Severity } from "@/lib/types";
import { DAILY_MAX_MG } from "@/lib/checks";

const SEV: Record<Severity, { label: string; chip: string; card: string }> = {
  high: { label: "Talk to a pharmacist", chip: "bg-high text-white", card: "border-high/30" },
  moderate: { label: "Worth asking about", chip: "bg-mod text-white", card: "border-mod/30" },
  info: { label: "Good to know", chip: "bg-info text-white", card: "border-info/20" },
};

const BASIS: Record<Finding["basis"], string> = {
  rxnorm: "✓ Verified with RxNorm (U.S. National Library of Medicine)",
  "fda-label": "✓ Quoted from the FDA label",
  "ai-reviewed-label": "✓ AI-explained · every quote checked against the FDA label",
  "ai-read-instructions": "AI reading of the directions",
};

export default function Results({
  data,
  summary,
  rejected,
}: {
  data: CheckResult;
  summary: string;
  rejected: number;
}) {
  const names = new Map(data.meds.map((m) => [m.input.id, m.input.name]));
  const high = data.findings.filter((f) => f.severity === "high").length;
  const mod = data.findings.filter((f) => f.severity === "moderate").length;
  const questions = data.findings.filter((f) => f.severity !== "info" || f.kind === "instructions");

  return (
    <div className="space-y-6">
      <section className={`rounded-3xl p-6 sm:p-8 ${high ? "bg-high text-white" : mod ? "bg-mod text-white" : "bg-brand text-white"}`}>
        <p className="text-xs uppercase tracking-[0.2em] opacity-80 font-semibold">Your results</p>
        <h2 className="font-display text-3xl sm:text-4xl mt-2 leading-tight">
          {high ? `${high} serious ${high === 1 ? "problem" : "problems"} to fix` : mod ? `${mod} ${mod === 1 ? "thing" : "things"} to ask about` : "No problems found in the official data"}
        </h2>
        {summary ? <p className="mt-3 text-lg opacity-95">{summary}</p> : (
          <p className="mt-3 opacity-90">
            {high ? "Don't stop any prescribed medicine on your own. Show this page to your pharmacist or doctor." : "This check covers what's in the FDA labels and RxNorm. Your pharmacist can review things it can't, like your health conditions."}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-white/15 px-3 py-1">{data.meds.length} medicines</span>
          <span className="rounded-full bg-white/15 px-3 py-1">{data.checkedPairs} pairs checked</span>
          <span className="rounded-full bg-white/15 px-3 py-1">{data.labelsFound} FDA labels read</span>
          {data.aiReviewed && <span className="rounded-full bg-white/15 px-3 py-1">AI-reviewed{rejected ? ` · ${rejected} unverifiable AI claim${rejected === 1 ? "" : "s"} discarded` : ""}</span>}
        </div>
      </section>

      {data.warnings.length > 0 && (
        <div className="rounded-2xl bg-mod-soft text-mod p-4 text-sm space-y-1">
          {data.warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}

      <section className="space-y-4">
        {data.findings.map((f) => (
          <article key={f.id} className={`print-break rounded-3xl bg-card border-2 ${SEV[f.severity].card} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${SEV[f.severity].chip}`}>{SEV[f.severity].label}</span>
              {f.meds.map((id) => <span key={id} className="rounded-full bg-paper px-3 py-1 text-xs font-medium">{names.get(id)}</span>)}
            </div>
            <h3 className="mt-3 font-display text-2xl leading-snug">{f.title}</h3>
            <p className="mt-2 text-ink-soft leading-relaxed">{f.explanation}</p>

            {f.evidence.length > 0 && (
              <div className="mt-4 space-y-2">
                {f.evidence.map((e) => (
                  <figure key={e.quote} className="rounded-xl bg-paper p-4 border-l-4 border-ink/70">
                    <blockquote className="text-sm leading-relaxed">“{e.quote}”</blockquote>
                    <figcaption className="mt-2 text-xs text-ink-soft">
                      FDA label: {e.labelTitle} · {e.section}
                      {e.url && <> · <a href={e.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">view on DailyMed ↗</a></>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl bg-brand-soft text-ink p-3 text-sm"><span className="font-semibold">What to do: </span>{f.action}</div>
            <p className="mt-3 text-xs text-ink-soft">{BASIS[f.basis]}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl bg-card border border-line p-6">
        <h3 className="font-display text-2xl">What&apos;s actually in your medicines</h3>
        <p className="text-sm text-ink-soft mt-1">Brand names hide ingredients. Here&apos;s what each product contains.</p>
        <ul className="mt-4 divide-y divide-line">
          {data.meds.map((m) => (
            <li key={m.input.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{m.input.name}</span>
                {m.matchedName && <span className="text-xs text-ink-soft">matched: {m.matchedName}</span>}
              </div>
              {m.unresolved ? (
                <p className="text-sm text-mod">Not recognized. Check the spelling or scan the label.</p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.ingredients.map((i) => (
                    <span key={i.name} className="rounded-lg bg-paper px-2.5 py-1 text-sm">
                      <span className="font-medium">{i.name}</span>
                      {i.strengthMg ? ` ${i.strengthMg} mg` : ""}
                      {i.classes[0] && <span className="text-ink-soft"> · {i.classes[0].toLowerCase()}</span>}
                      {DAILY_MAX_MG[i.name] && <span className="text-mod"> · max {DAILY_MAX_MG[i.name].mg.toLocaleString()} mg/day</span>}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {questions.length > 0 && (
        <section className="rounded-3xl bg-ink text-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-2xl">Questions for your pharmacist</h3>
            <button onClick={() => window.print()} className="no-print rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-medium">Print</button>
          </div>
          <ol className="mt-4 space-y-2 list-decimal pl-5">
            {questions.map((f) => <li key={f.id}><span className="font-medium">{f.title}.</span> <span className="text-white/75">{f.action}</span></li>)}
          </ol>
        </section>
      )}

      <p className="text-xs text-ink-soft leading-relaxed">
        MedGuard is a hackathon prototype for education, not medical advice. It only knows what&apos;s in RxNorm and FDA labels, not your
        health conditions or labs. No result means &ldquo;nothing found in this data&rdquo;, not &ldquo;safe&rdquo;. Always check with a pharmacist.
      </p>
    </div>
  );
}
