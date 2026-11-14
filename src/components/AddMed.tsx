"use client";

import { useRef, useState } from "react";
import type { MedInput } from "@/lib/types";
import type { Scan } from "@/lib/ai";

const uid = () => Math.random().toString(36).slice(2, 9);

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Shrink big phone photos before upload (keeps labels readable, uploads fast). */
async function prepareImage(file: File): Promise<{ data: string; mediaType: string }> {
  if (file.type === "application/pdf" || file.size < 1_500_000) return { data: await readAsBase64(file), mediaType: file.type || "image/jpeg" };
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return { data: c.toDataURL("image/jpeg", 0.9).split(",")[1], mediaType: "image/jpeg" };
}

type Draft = Scan["products"][number] & { key: string };

export default function AddMed({ onAdd }: { onAdd: (m: MedInput) => void }) {
  const [typed, setTyped] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function scan(file: File) {
    setError(null);
    setScanning(true);
    try {
      const res = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await prepareImage(file)) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Scan failed");
      const scan = j as Scan;
      if (!scan.isMedicationLabel || !scan.products.length) throw new Error("That doesn't look like a medicine label. Try a closer photo of the Drug Facts or pharmacy label.");
      setDrafts(scan.products.map((p) => ({ ...p, key: uid() })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addTyped() {
    const name = typed.trim();
    if (!name) return;
    onAdd({ id: uid(), name, ingredients: [], unitsPerDose: null, maxDosesPerDay: null, directions: "", source: "typed" });
    setTyped("");
  }

  function confirm(d: Draft) {
    onAdd({
      id: uid(),
      name: d.productName,
      ingredients: d.ingredients.filter((i) => i.name.trim()),
      unitsPerDose: d.unitsPerDose,
      maxDosesPerDay: d.maxDosesPerDay,
      directions: d.directions,
      source: "scan",
    });
    setDrafts((ds) => ds.filter((x) => x.key !== d.key));
  }

  const update = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={scanning}
        className="w-full rounded-2xl bg-brand text-white py-4 font-semibold flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-60 transition"
      >
        {scanning ? (
          <><span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Reading the label…</>
        ) : (
          <>📷 Scan a medicine label</>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />

      <form onSubmit={(e) => { e.preventDefault(); addTyped(); }} className="flex gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="…or type a name, e.g. Eliquis 5 mg"
          aria-label="Medicine name"
          className="flex-1 min-w-0 rounded-xl border border-line bg-card px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
        <button className="rounded-xl bg-ink text-white px-4 font-semibold disabled:opacity-40" disabled={!typed.trim()}>Add</button>
      </form>

      {error && <p role="alert" className="rounded-xl bg-high-soft text-high p-3 text-sm">{error}</p>}

      {drafts.map((d) => (
        <div key={d.key} className="rounded-2xl border-2 border-brand/40 bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Check what we read</p>
          <input value={d.productName} onChange={(e) => update(d.key, { productName: e.target.value })} aria-label="Product name"
            className="w-full rounded-lg border border-line px-3 py-2 font-semibold" />
          <div>
            <p className="text-sm font-medium">Active ingredients</p>
            {d.ingredients.map((ing, i) => (
              <div key={i} className="mt-1.5 flex gap-2">
                <input value={ing.name} aria-label="Ingredient"
                  onChange={(e) => update(d.key, { ingredients: d.ingredients.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })}
                  className="flex-1 min-w-0 rounded-lg border border-line px-3 py-1.5 text-sm" />
                <input value={ing.strengthMg ?? ""} inputMode="decimal" aria-label="Strength in mg" placeholder="mg"
                  onChange={(e) => update(d.key, { ingredients: d.ingredients.map((x, k) => (k === i ? { ...x, strengthMg: e.target.value ? parseFloat(e.target.value) : null } : x)) })}
                  className="w-20 rounded-lg border border-line px-3 py-1.5 text-sm" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>Per dose
              <input value={d.unitsPerDose ?? ""} inputMode="decimal" onChange={(e) => update(d.key, { unitsPerDose: e.target.value ? parseFloat(e.target.value) : null })}
                className="mt-1 w-full rounded-lg border border-line px-3 py-1.5" />
            </label>
            <label>Max doses / day
              <input value={d.maxDosesPerDay ?? ""} inputMode="decimal" onChange={(e) => update(d.key, { maxDosesPerDay: e.target.value ? parseFloat(e.target.value) : null })}
                className="mt-1 w-full rounded-lg border border-line px-3 py-1.5" />
            </label>
          </div>
          {d.directions && <p className="text-sm text-ink-soft">“{d.directions}”</p>}
          {d.unreadable && <p className="text-sm text-mod">Couldn&apos;t read: {d.unreadable}</p>}
          <div className="flex gap-2">
            <button onClick={() => confirm(d)} className="flex-1 rounded-xl bg-brand text-white py-2.5 font-semibold">Looks right, add it</button>
            <button onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} className="rounded-xl border border-line px-4 text-sm">Discard</button>
          </div>
        </div>
      ))}
    </div>
  );
}
