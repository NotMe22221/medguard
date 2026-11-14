// End-to-end AI test: renders realistic medicine labels, photographs them in a headless
// browser, sends the photos to /api/scan, then runs /api/check on what was read.
// Usage: node e2e/scan-test.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "e2e/out";
mkdirSync(OUT, { recursive: true });

const LABELS = {
  "cold-flu": `
  <div class="box" style="transform: rotate(-3deg)">
    <div class="brand">Nighttime <b>Cold &amp; Flu</b> Relief</div>
    <div class="facts">
      <h1>Drug Facts</h1>
      <table>
        <tr><th>Active ingredients (in each 30 mL)</th><th>Purposes</th></tr>
        <tr><td>Acetaminophen 650 mg</td><td>Pain reliever/fever reducer</td></tr>
        <tr><td>Dextromethorphan HBr 30 mg</td><td>Cough suppressant</td></tr>
        <tr><td>Doxylamine succinate 12.5 mg</td><td>Antihistamine</td></tr>
      </table>
      <h2>Warnings</h2>
      <p><b>Liver warning:</b> This product contains acetaminophen. Severe liver damage may occur if you take more than 4 doses in 24 hours, with other drugs containing acetaminophen, or 3 or more alcoholic drinks every day while using this product.</p>
      <h2>Directions</h2>
      <p><b>adults &amp; children 12 yrs &amp; over:</b> take 30 mL in dose cup provided every 6 hours. Do not exceed 4 doses per 24 hours.</p>
    </div>
  </div>`,
  "rx-apixaban": `
  <div class="rx" style="transform: rotate(2deg)">
    <div class="pharm">CORNER PHARMACY &nbsp;·&nbsp; 555-0142</div>
    <div class="row"><span>Rx# 7731042</span><span>Filled 11/02/2026</span></div>
    <div class="pt">PAT: J. RIVERA (sample)</div>
    <div class="drug">APIXABAN 5 MG TABLET</div>
    <div class="sub">Generic for ELIQUIS</div>
    <div class="sig">TAKE 1 TABLET BY MOUTH TWICE DAILY</div>
    <div class="row small"><span>QTY: 60</span><span>Refills: 3</span><span>Dr. A. Patel</span></div>
  </div>`,
};

const CSS = `
  body { margin:0; padding:40px; background: radial-gradient(circle at 30% 20%, #d9d2c3, #a99f8c); font-family: Helvetica, Arial, sans-serif; }
  .box { width: 520px; background:#fff; padding:18px; box-shadow: 0 18px 40px rgba(0,0,0,.35); }
  .brand { background:#1d2b6b; color:#fff; padding:14px; font-size:24px; margin-bottom:12px; }
  .facts { border:3px solid #000; padding:10px; color:#000; }
  .facts h1 { margin:0 0 6px; font-size:28px; font-weight:900; border-bottom:6px solid #000; }
  .facts h2 { margin:10px 0 4px; font-size:17px; border-top:2px solid #000; padding-top:6px; }
  .facts table { width:100%; border-collapse:collapse; font-size:15px; }
  .facts th { text-align:left; border-bottom:1px solid #000; }
  .facts td { padding:2px 0; }
  .facts p { margin:2px 0; font-size:14px; line-height:1.3; }
  .rx { width:560px; background:#fffdf5; padding:20px 24px; box-shadow: 0 18px 40px rgba(0,0,0,.35); font-family: "Courier New", monospace; color:#111; }
  .pharm { font-weight:bold; font-size:18px; border-bottom:2px solid #333; padding-bottom:6px; margin-bottom:8px; }
  .row { display:flex; justify-content:space-between; font-size:15px; margin:4px 0; }
  .small { font-size:13px; }
  .pt { font-size:15px; margin:6px 0; }
  .drug { font-size:26px; font-weight:bold; margin-top:10px; }
  .sub { font-size:14px; }
  .sig { font-size:20px; font-weight:bold; margin:14px 0; padding:10px; border:2px solid #111; }
`;

const executablePath = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 700, height: 760 } });
const photos = {};
for (const [name, html] of Object.entries(LABELS)) {
  await page.setContent(`<style>${CSS}</style>${html}`);
  const file = path.join(OUT, `${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 85 });
  photos[name] = file;
}
await browser.close();

const post = async (url, body) => {
  const t = Date.now();
  const r = await fetch(`${BASE}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json(), ms: Date.now() - t };
};

let failures = 0;
const check = (name, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

// 1) Scan
const meds = [];
for (const [name, file] of Object.entries(photos)) {
  const { status, json, ms } = await post("/api/scan", { data: readFileSync(file).toString("base64"), mediaType: "image/jpeg" });
  console.log(`\nscan ${name} (${ms} ms):`, JSON.stringify(json));
  check(`scan ${name} succeeded`, status === 200 && json.isMedicationLabel && json.products?.length === 1, `status ${status}`);
  const p = json.products?.[0];
  if (!p) continue;
  meds.push({ id: name, name: p.productName, ingredients: p.ingredients, unitsPerDose: p.unitsPerDose, maxDosesPerDay: p.maxDosesPerDay, directions: p.directions, source: "scan" });
}
const cf = meds.find((m) => m.id === "cold-flu");
const rx = meds.find((m) => m.id === "rx-apixaban");
check("read all 3 cold & flu ingredients", cf?.ingredients.length === 3);
check("read acetaminophen 650 mg", cf?.ingredients.some((i) => /acetaminophen/i.test(i.name) && i.strengthMg === 650));
check("read max 4 doses/day", cf?.maxDosesPerDay === 4);
check("read apixaban 5 mg twice daily", rx?.ingredients.some((i) => /apixaban/i.test(i.name) && i.strengthMg === 5) && rx?.maxDosesPerDay === 2);

// 2) Not a label
{
  const { json } = await post("/api/scan", { data: readFileSync(photos["cold-flu"]).toString("base64").slice(0, 0) || "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", mediaType: "image/png" });
  check("blank image is not treated as a label", json.isMedicationLabel === false || json.error, JSON.stringify(json).slice(0, 120));
}

// 3) Full AI-reviewed check: scanned meds + typed Tylenol and Advil
meds.push(
  { id: "typed-tylenol", name: "Tylenol Extra Strength", ingredients: [{ name: "acetaminophen", strengthMg: 500 }], unitsPerDose: 2, maxDosesPerDay: 3, directions: "Take 2 caplets every 6 hours. Do not take more than 6 caplets in 24 hours.", source: "typed" },
  { id: "typed-advil", name: "Advil", ingredients: [], unitsPerDose: null, maxDosesPerDay: null, directions: "Take as directed.", source: "typed" },
);
const { status, json, ms } = await post("/api/check", { meds });
console.log(`\ncheck (${ms} ms): status ${status}, aiReviewed=${json.result?.aiReviewed}, rejected=${json.rejected}`);
console.log("summary:", json.summary);
for (const f of json.result?.findings ?? []) {
  console.log(`\n[${f.severity}] ${f.kind} · ${f.basis}\n  ${f.title}\n  ${f.explanation}\n  → ${f.action}`);
  for (const e of f.evidence) console.log(`    “${e.quote.slice(0, 160)}” (${e.labelTitle})`);
}
check("AI review ran", json.result?.aiReviewed === true, (json.result?.warnings ?? []).join(" | "));
check("acetaminophen duplicate found", json.result?.findings.some((f) => f.kind === "duplicate-ingredient" && /acetaminophen/i.test(f.title)));
check("apixaban + Advil bleeding interaction found", json.result?.findings.some((f) => f.kind === "interaction" && f.meds.includes("rx-apixaban") && f.meds.includes("typed-advil")));
check("every interaction carries a verified quote", (json.result?.findings ?? []).filter((f) => f.kind === "interaction").every((f) => f.evidence.length > 0));

console.log(failures ? `\n${failures} failure(s)` : "\nAll AI checks passed");
process.exit(failures ? 1 : 0);
