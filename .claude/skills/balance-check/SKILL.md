---
name: balance-check
description: "Describe when and why an agent should use this skill."
---

# balance-check

The goal is to measure combat balance and then judge the results honestly. The validator is advisory and does not fail CI, which makes its warnings easy to wave away. On this project, real problems have been dismissed as measurement artifacts at least three separate times, and they were real every time.

Tune to the middle of each band, not to its edge. The validator measures one reference loadout, but real players run six ascendancies and many skill and support combinations. A zone tuned to barely pass will be wrong for builds stronger or weaker than the reference.Target bands
Metric	Target	Failure signs
Regular-zone trash TTK	1 to 3 seconds, aim near 2	Under 0.4s trivial, over 4s grindy
Hits-to-die	8 to 20, aim near 14	Under 6 spiky, over 40 no tension
Boss TTK	30 to 90 seconds	Boss zones may sit slightly outside the h2d band
Campaign TTK drift	under 3x	Higher means some acts trivialize or wall
Armour mitigation drift	under 20 points	Wider means armour is not tracking damage scaling
## Steps

1. Run bun run validate:balance and paste the raw output.
2. List every metric outside its band, naming the zone and the actual value.
3.Classify each one as real or artifact, and justify it. There is exactly ONE legitimate artifact on this project. Boss-only zones, meaning ruined_bastion, cinder_throne, spire_crown, and the Act 4 and Act 5 boss lairs, report boss TTK in the trash column because they contain no trash monsters. This also inflates the campaign-wide TTK drift figure. That is the complete list. Everything else is real until proven otherwise.
4.Investigate anything not on that list. Hits-to-die outside 8 to 20 in a regular zone compares monster damage against real player EHP and cannot be faked by 2x to 5x through modelling error. Regular-zone trash TTK outside 1 to 3 seconds means monster life is wrong for the curve. Armour mitigation drift over 20 points means armour affix magnitudes are not scaling on the same per-act curve as monster damage. The formula armour / (armour + 5 * hit) is scale-invariant only when armour and damage grow at the same rate. When they diverge, mitigation creeps toward invincibility.
5.If you changed anything, report before and after values per zone touched, and state whether the fix landed in game data under src/data/ or only in the validator or its estimate. Those are not the same thing.
Constraints
Before concluding artifact, confirm the flag is in a boss-only zone in the trash-TTK column specifically. If it is a different category than earlier warnings, "consistent with before" is not a valid dismissal.
If a number got worse after a fix, meaning a drift widened or a value moved further out of band, say so plainly rather than restating the fix claim.
If you find yourself compensating for the validator rather than fixing the data, for example needing a 6.7x monster-life jump where the curve called for 2.4x, stop and report it. That pattern once meant the player-power estimate had drifted from reality, and tuning content against a broken gauge compounds across every act built afterward.
