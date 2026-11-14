# MedGuard

**Are your medicines safe together?** Snap a photo of each medicine label. MedGuard finds hidden duplicate ingredients, risky combinations and confusing directions, and every warning shows the exact words of the official FDA label. Built for DSH Hacks V2 (AI x Healthcare).

## The problem

People, especially older adults and caregivers, mix prescriptions with over-the-counter products whose brand names hide what's inside. Tylenol and NyQuil both contain acetaminophen, and acetaminophen overdose is a leading cause of acute liver failure in the U.S. A blood thinner plus an everyday pain reliever like Advil raises bleeding risk. These warnings exist, but they're buried in long FDA labels nobody reads.

## How it works

| Step | Source | AI? |
|---|---|---|
| Read the label photo (product, active ingredients, strength, directions) | Claude vision, then the user confirms | Yes |
| Identify each ingredient and its drug class | **RxNorm** + **RxClass** (U.S. National Library of Medicine) | No |
| Same ingredient in two products, with combined daily total vs. label maximum | Rules + published OTC limits | No |
| Two drugs of the same risky class (two NSAIDs, two blood thinners) | FDA pharmacologic classes | No |
| Interaction evidence | Exact sentences from **FDA labels** (openFDA), with a DailyMed link | No |
| Plain-language explanation, confusing directions, summary | Claude reads the label text | Yes, **quote-verified** |

**Trust by design:** AI can only add an interaction if it quotes a sentence that exists word-for-word in the FDA label; the server checks every quote and discards the rest (the results show how many were discarded). AI can raise a severity but never remove or downgrade a rule-based warning. Labels are only used when they're for that ingredient alone, so a combination product's warnings are never pinned on the wrong drug. Sentences that say "no effect" are ignored.

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to enable scanning + AI review
npm run dev                  # http://localhost:3000
```

The scripts run Node with `--use-system-ca` so lookups work behind antivirus or corporate HTTPS inspection.

## Tests

```bash
npm test                                     # rule logic (duplicates, limits, classes, label evidence)
LIVE=1 npx vitest run src/lib/live.test.ts   # real RxNorm + openFDA on the sample cabinet
```

## Limits

Education prototype, not medical advice. It knows only what's in RxNorm and FDA labels, not a person's conditions, kidney function or labs. "No problems found" means nothing was found in this data, not "safe". Always confirm with a pharmacist.
