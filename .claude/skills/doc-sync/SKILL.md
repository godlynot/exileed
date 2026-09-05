---
name: doc-sync
description: "Describe when and why an agent should use this skill."
---

# doc-sync

The goal is to confirm the project documentation agrees with itself and with the code before building on top of it. This exists because the two docs once described two different games. CONTEXT.md listed one class roster while AI_HANDOFF.md listed another, and an agent reading the stale one nearly rebuilt the wrong content.

Report contradictions rather than silently picking a version. The docs have disagreed on things as fundamental as which classes exist.

## Steps

1. Read CONTEXT.md and AI_HANDOFF.md.
2. Verify the campaign structure. Eight acts spanning roughly levels 1 to 65, with maps carrying 65 to 90:
3.Check the numbers that have drifted before, confirming both docs match the code. Tick rate, where src/data/balance.ts is authoritative. Trial levels and total ascendancy points, which are 8 points at 2 per trial. Support-slot growth milestones, which were once written as Acts 3, 6, and 9 when the campaign has only 8 acts. Passive tree rendering, which is SVG, since an early doc said Konva but the tree shipped as SVG.
4.Confirm known bugs are actually listed as tracked open items, not just mentioned in passing. Specifically check that armour mitigation drift appears as an open bug, since it has been described in conversation many times and repeatedly never written down.
5.Report findings plainly. Do the docs agree with each other, do they agree with the code, which one is stale, and what needs updating. Code wins for implementation facts and the design docs win for intent. Stamp both with a fresh last-updated date after reconciling.
Constraints

Do not silently resolve a contradiction by picking whichever version seems more likely. Surface it and let the user decide, because the cost of guessing wrong here is rebuilding the wrong syste
