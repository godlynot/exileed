---
name: debug-check
description: "Describe when and why an agent should use this skill."
---

# debug-check

Explain the goal, the workflow, and any constraints that matter.

## Steps

1.Run the full check suite and paste RAW output. Not a summary, not a table of checkmarks. Actual terminal output for: bun tsc -b --noEmit, bun run build, bun run validate:tree, bun run validate:ascendancies, bun run validate:balance. If you skipped one, name it and say why.
2. Cite evidence for every claim. If you said a number changed, show the before value and the after value. If you said something is fixed, show the output line proving it. If you said a test passes, name the test.
3.Check each metric you touched against its target band and state whether it is inside. Regular-zone trash TTK 1 to 3 seconds, aiming near 2. Hits-to-die 8 to 20, aiming near 14. Boss TTK 30 to 90 seconds. Campaign TTK drift under 3x. Armour mitigation drift under 20 points. If a number moved the wrong way, meaning a drift widened or a count went out of band, flag it yourself rather than describing it as fixed.
4.List what you did NOT do. Anything skipped, deferred, simplified, or loosely interpreted. If an instruction was vague and you narrowed it, say how you narrowed it.
5.Distinguish real fixes from measurement fixes. Confirm balance or behaviour changes landed in src/data/ or src/systems/, not only in a test or a validator estimate. If a validator still uses an estimate rather than the real character-stat pipeline, say so explicitly. "I fixed the relationship" once meant "I fixed the data but the validator still drifts," which is a much weaker claim.
6.Report commit status. List modified files, untracked files, and the commit hash. Uncommitted work does not exist.
When a number still looks wrong after a fix

Do not re-explain your reasoning. Instead, print the value at each step, per act or per zone or per tier, rather than the summary figure. Identify the exact file, function, and formula producing it. State whether the problem is in game data, in a system, or in the measurement tool, because those are three different fixes. If it is the measurement tool, that is still a bug, since a validator that drifts on its own estimate cannot be trusted for the next feature.

Constraints
Do not call a real problem a validator artifact without checking the known-artifact list. The only genuine artifact is the trash-TTK column reporting boss TTK in boss-only zones.
Do not present building a tool to check something as equivalent to having checked it. If asked for a number, produce the number.
"Consistent with the older warnings" is only valid if the flag categories actually match. New categories mean new problems.
