---
name: scope-check
description: "Describe when and why an agent should use this skill."
---

# scope-check

The goal is to catch deferred systems creeping back in disguised as minor tweaks. Several systems on this project were cut on purpose, and the usual way they return is as an innocent-sounding feature request whose implementation quietly requires them. Full details live in POST-M5-BACKLOG.md in the repo root. This skill is the fast check.

Flagging is not refusing. Most requests have a scoped-down version that delivers the intent without the deferred system, and proposing that version is the point.

## Steps

1. Ask whether the request requires monster or player POSITIONS. Coordinates, distance values, movement simulation, collision, pathfinding, or a camera.
2. Ask whether it requires ALLIES or MINIONS. Any entity fighting alongside the player that is not the player.
3.Ask whether it requires a NEW SUBSYSTEM, as opposed to extending one that already exists.
4.If any answer is yes, stop and flag it before building. Do not build the prerequisite inline.
5.Propose a scoped-down version that delivers the intent, naming explicitly what you are cutting and why, then let the user decide.
6.Check whether the request is already a known bug rather than new work. The backlog currently lists armour mitigation drift, which is real and repeatedly misfiled as a validator artifact; the bundle chunk-size warning, which is low priority and fixed with manualChunks; and the elite drop-bonus gap, which was folded into the elite-restoration spec and needs verifying that it shipped.
What is deliberately deferred

Spatial and positional combat. The top-down view, real distance values, monsters closing distance, back-line targeting, and collision. Combat emits events so a view layer can attach later, but that is a hook, not permission to build the view. The existing lane view is decorative only. Its drift animation is not a position, and band membership is a discrete state change.

Minions and allies. Herald auras and Marshal armies apply to a party target-set currently containing only the player. That is deliberate future-proofing, not an incomplete feature.

Map-tier scaling of pack size and elite caps. Deferred to the map system's own design pass. Maps use the flat Act 8 and later rule, meaning pack size 1 to 4 and elite cap 2, uniformly until then.

Re-rolling map affixes. Maps roll affixes once at creation and keep them for life. Never expose a re-roll action.

Map salvage or scrap economy. Maps delete at 0 charges. No salvage in v1.

Worked example

A request to add distance or chunks to the lane so skills have range risked introducing continuous distance values, which is real positional combat. The version that shipped instead used discrete range bands as skill tags, meaning melee, near, and far, reusing the existing tag-compatibility system, where range determines how many pack members front-to-back a skill can hit. No coordinates, no movement, no back-line sniping.

Constraints

If implementing something starts requiring coordinates, movement physics, a second combat entity type, or a whole new data system, the scope has drifted. Stop and say so. This is the specific thing the project has asked for repeatedly, not unhelpfulness.
