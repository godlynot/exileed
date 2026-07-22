/**
 * passiveTree.ts — M3 passive skill tree data (80 nodes)
 *
 * APPROVED LAYOUT. Do not re-derive coordinates or edges; this graph is
 * validated (no orphans, no isolated nodes, no node pairs closer than 42px,
 * all three classes equidistant to their own keystone and to the hub).
 *
 * Structure:
 *   3 class regions x (1 root + 1 keystone + 4 notables + 14 smalls) = 60
 *   Central hub: 3 keystones + 3 notables + 8 smalls                 = 14
 *   Bridges: 3 x 2 smalls                                            =  6
 *                                                                     ----
 *                                                                       80
 *
 * Canvas: 1600 x 1400. Hub centroid (800, 750). Roots on a 550-unit radius.
 *
 * Verified path costs (edges from class root):
 *   own region keystone .......... 7  (all three classes)
 *   nearest two hub keystones .... 8  (all three classes)
 *   third hub keystone .......... 10  (all three classes)
 *   another region's keystone ... 15-16
 *
 * Every notable has at least two approach paths.
 */

import type { PassiveNode, PassiveTree, NodeType } from '../types/game.ts'

export type ClassId = "oracle" | "warlord" | "plaguebringer";

export const CANVAS = { width: 1600, height: 1400 } as const;

export const NODE_RADIUS: Record<NodeType, number> = {
  small: 14,
  notable: 26,
  keystone: 38,   // render as a hexagon, not a circle
  root: 30,
};

export const PASSIVE_NODES: PassiveNode[] = [
  { id: "root_plaguebringer", type: "root", name: "Path of the Plaguebringer", classRoot: "plaguebringer", x: 811, y: 208, stats: [{ stat: "flat_dexterity", mode: "flat", value: 10 }, { stat: "flat_evasion", mode: "flat", value: 25 }, { stat: "flat_accuracy", mode: "flat", value: 30 }] },
  { id: "root_warlord", type: "root", name: "Path of the Warlord", classRoot: "warlord", x: 329, y: 1017, stats: [{ stat: "flat_strength", mode: "flat", value: 10 }, { stat: "flat_life", mode: "flat", value: 15 }, { stat: "flat_armour", mode: "flat", value: 20 }] },
  { id: "root_oracle", type: "root", name: "Path of the Oracle", classRoot: "oracle", x: 1269, y: 1015, stats: [{ stat: "flat_intelligence", mode: "flat", value: 10 }, { stat: "flat_energy_shield", mode: "flat", value: 18 }, { stat: "inc_spell_damage_percent", mode: "increased", value: 8 }] },
  { id: "a_k", type: "keystone", name: "Elemental Dominion", x: 1686, y: 1296, stats: [{ stat: "special:elemental_dominion", mode: "special", value: 1 }], description: "50% of your physical damage is converted to lightning damage, but you take 25% more lightning damage." },
  { id: "b_k", type: "keystone", name: "Juggernaut's Stance", x: -105, y: 1257, stats: [{ stat: "special:juggernauts_stance", mode: "special", value: 1 }], description: "+30% increased armour and +20% increased maximum life, but 25% reduced attack and cast speed." },
  { id: "h_k1", type: "keystone", name: "Iron Reservation", x: 911, y: 689, stats: [{ stat: "special:iron_reservation", mode: "special", value: 1 }], description: "+50% increased maximum life and energy shield, but you cannot regenerate life or recharge energy shield." },
  { id: "h_k2", type: "keystone", name: "Zealot's Creed", x: 804, y: 877, stats: [{ stat: "special:zealots_creed", mode: "special", value: 1 }], description: "Your maximum elemental resistances are raised to 85%, but your maximum life and energy shield are halved." },
  { id: "h_k3", type: "keystone", name: "Vengeful Resolve", x: 689, y: 688, stats: [{ stat: "special:vengeful_resolve", mode: "special", value: 1 }], description: "35% more damage dealt, but you take 25% more damage from all sources." },
  { id: "s_k", type: "keystone", name: "Perfect Aim", x: 827, y: -285, stats: [{ stat: "special:perfect_aim", mode: "special", value: 1 }], description: "Your attacks and spells always hit, but your critical strike chance is set to zero." },
  { id: "a_n1", type: "notable", name: "Deep Study", x: 1455, y: 992, stats: [{ stat: "inc_spell_damage_percent", mode: "increased", value: 20 }, { stat: "flat_intelligence", mode: "flat", value: 15 }] },
  { id: "a_n2", type: "notable", name: "Resonant Ward", x: 1317, y: 1273, stats: [{ stat: "inc_es_percent", mode: "increased", value: 25 }, { stat: "es_recharge_rate_percent", mode: "increased", value: 15 }] },
  { id: "a_n3", type: "notable", name: "Prismatic Guard", x: 1605, y: 1038, stats: [{ stat: "all_res_percent", mode: "flat", value: 10 }, { stat: "inc_es_percent", mode: "increased", value: 8 }] },
  { id: "a_n4", type: "notable", name: "Stormweaver", x: 1502, y: 1312, stats: [{ stat: "inc_ele_damage_percent", mode: "increased", value: 22 }, { stat: "inc_crit_multi_percent", mode: "increased", value: 15 }] },
  { id: "b_n1", type: "notable", name: "Iron Grip", x: 265, y: 1200, stats: [{ stat: "inc_phys_damage_percent", mode: "increased", value: 20 }, { stat: "flat_strength", mode: "flat", value: 15 }] },
  { id: "b_n2", type: "notable", name: "Bulwark", x: 109, y: 937, stats: [{ stat: "inc_armour_percent", mode: "increased", value: 25 }, { stat: "inc_life_percent", mode: "increased", value: 8 }] },
  { id: "b_n3", type: "notable", name: "Unbreakable", x: 127, y: 1304, stats: [{ stat: "inc_life_percent", mode: "increased", value: 12 }, { stat: "phys_reduction_percent", mode: "increased", value: 5 }, { stat: "flat_fire_res", mode: "flat", value: 10 }] },
  { id: "b_n4", type: "notable", name: "Crushing Blows", x: -31, y: 1072, stats: [{ stat: "inc_phys_damage_percent", mode: "increased", value: 22 }, { stat: "inc_attack_speed_percent", mode: "increased", value: 8 }] },
  { id: "h_n1", type: "notable", name: "Vital Convergence", x: 875, y: 632, stats: [{ stat: "inc_life_percent", mode: "increased", value: 15 }, { stat: "flat_strength", mode: "flat", value: 10 }] },
  { id: "h_n2", type: "notable", name: "Warded Convergence", x: 865, y: 875, stats: [{ stat: "inc_es_percent", mode: "increased", value: 15 }, { stat: "flat_intelligence", mode: "flat", value: 10 }] },
  { id: "h_n3", type: "notable", name: "Tempered Will", x: 663, y: 742, stats: [{ stat: "all_res_percent", mode: "flat", value: 8 }, { stat: "inc_life_percent", mode: "increased", value: 6 }] },
  { id: "s_n1", type: "notable", name: "Swift Strikes", x: 689, y: 45, stats: [{ stat: "inc_attack_speed_percent", mode: "increased", value: 10 }, { stat: "flat_dexterity", mode: "flat", value: 15 }] },
  { id: "s_n2", type: "notable", name: "Ghost Dance", x: 992, y: 52, stats: [{ stat: "inc_evasion_percent", mode: "increased", value: 25 }, { stat: "inc_accuracy_percent", mode: "increased", value: 10 }] },
  { id: "s_n3", type: "notable", name: "Wind Reader", x: 639, y: -115, stats: [{ stat: "inc_evasion_percent", mode: "increased", value: 15 }, { stat: "inc_life_percent", mode: "increased", value: 8 }, { stat: "flat_cold_res", mode: "flat", value: 10 }] },
  { id: "s_n4", type: "notable", name: "Lethality", x: 943, y: -139, stats: [{ stat: "inc_crit_chance_percent", mode: "increased", value: 25 }, { stat: "inc_crit_multi_percent", mode: "increased", value: 18 }] },
  { id: "a_br1", type: "small", name: "", x: 1086, y: 1150, stats: [{ stat: "flat_intelligence", mode: "flat", value: 10 }] },
  { id: "a_br2", type: "small", name: "", x: 956, y: 1019, stats: [{ stat: "inc_es_percent", mode: "increased", value: 8 }] },
  { id: "a_s1", type: "small", name: "", x: 1372, y: 988, stats: [{ stat: "flat_intelligence", mode: "flat", value: 8 }] },
  { id: "a_s10", type: "small", name: "", x: 1494, y: 1218, stats: [{ stat: "flat_lightning_damage", mode: "flat", value: 4 }] },
  { id: "a_s11", type: "small", name: "", x: 1419, y: 1304, stats: [{ stat: "inc_ele_damage_percent", mode: "increased", value: 8 }] },
  { id: "a_s12", type: "small", name: "", x: 1683, y: 1097, stats: [{ stat: "inc_es_percent", mode: "increased", value: 6 }] },
  { id: "a_s13", type: "small", name: "", x: 1693, y: 1186, stats: [{ stat: "flat_chaos_res", mode: "flat", value: 8 }] },
  { id: "a_s14", type: "small", name: "", x: 1620, y: 1300, stats: [{ stat: "inc_ele_damage_percent", mode: "increased", value: 8 }] },
  { id: "a_s2", type: "small", name: "", x: 1324, y: 1089, stats: [{ stat: "inc_es_percent", mode: "increased", value: 8 }] },
  { id: "a_s3", type: "small", name: "", x: 1208, y: 1168, stats: [{ stat: "inc_spell_damage_percent", mode: "increased", value: 8 }] },
  { id: "a_s4", type: "small", name: "", x: 1407, y: 1090, stats: [{ stat: "inc_ele_damage_percent", mode: "increased", value: 8 }] },
  { id: "a_s5", type: "small", name: "", x: 1234, y: 1258, stats: [{ stat: "flat_energy_shield", mode: "flat", value: 12 }] },
  { id: "a_s6", type: "small", name: "", x: 1415, y: 1148, stats: [{ stat: "flat_lightning_res", mode: "flat", value: 8 }] },
  { id: "a_s7", type: "small", name: "", x: 1562, y: 974, stats: [{ stat: "inc_es_percent", mode: "increased", value: 8 }] },
  { id: "a_s8", type: "small", name: "", x: 1513, y: 1120, stats: [{ stat: "flat_intelligence", mode: "flat", value: 8 }] },
  { id: "a_s9", type: "small", name: "", x: 1465, y: 1095, stats: [{ stat: "inc_spell_damage_percent", mode: "increased", value: 8 }] },
  { id: "b_br1", type: "small", name: "", x: 330, y: 789, stats: [{ stat: "flat_strength", mode: "flat", value: 10 }] },
  { id: "b_br2", type: "small", name: "", x: 503, y: 750, stats: [{ stat: "inc_life_percent", mode: "increased", value: 5 }] },
  { id: "b_s1", type: "small", name: "", x: 306, y: 1123, stats: [{ stat: "flat_strength", mode: "flat", value: 8 }] },
  { id: "b_s10", type: "small", name: "", x: 52, y: 1109, stats: [{ stat: "flat_phys_damage", mode: "flat", value: 4 }] },
  { id: "b_s11", type: "small", name: "", x: 14, y: 1008, stats: [{ stat: "inc_phys_damage_percent", mode: "increased", value: 8 }] },
  { id: "b_s12", type: "small", name: "", x: 67, y: 1334, stats: [{ stat: "inc_life_percent", mode: "increased", value: 6 }] },
  { id: "b_s13", type: "small", name: "", x: -28, y: 1287, stats: [{ stat: "flat_armour", mode: "flat", value: 30 }] },
  { id: "b_s14", type: "small", name: "", x: -101, y: 1142, stats: [{ stat: "inc_attack_speed_percent", mode: "increased", value: 4 }] },
  { id: "b_s2", type: "small", name: "", x: 249, y: 1034, stats: [{ stat: "inc_life_percent", mode: "increased", value: 5 }] },
  { id: "b_s3", type: "small", name: "", x: 229, y: 900, stats: [{ stat: "inc_armour_percent", mode: "increased", value: 8 }] },
  { id: "b_s4", type: "small", name: "", x: 202, y: 1110, stats: [{ stat: "inc_phys_damage_percent", mode: "increased", value: 8 }] },
  { id: "b_s5", type: "small", name: "", x: 142, y: 879, stats: [{ stat: "flat_life", mode: "flat", value: 12 }] },
  { id: "b_s6", type: "small", name: "", x: 160, y: 1069, stats: [{ stat: "flat_fire_res", mode: "flat", value: 8 }] },
  { id: "b_s7", type: "small", name: "", x: 235, y: 1301, stats: [{ stat: "inc_armour_percent", mode: "increased", value: 8 }] },
  { id: "b_s8", type: "small", name: "", x: 134, y: 1176, stats: [{ stat: "flat_strength", mode: "flat", value: 8 }] },
  { id: "b_s9", type: "small", name: "", x: 161, y: 1142, stats: [{ stat: "inc_life_percent", mode: "increased", value: 5 }] },
  { id: "h_entry_oracle", type: "small", name: "", x: 925, y: 817, stats: [{ stat: "flat_intelligence", mode: "flat", value: 10 }] },
  { id: "h_entry_warlord", type: "small", name: "", x: 678, y: 813, stats: [{ stat: "flat_strength", mode: "flat", value: 10 }] },
  { id: "h_entry_plaguebringer", type: "small", name: "", x: 804, y: 615, stats: [{ stat: "flat_dexterity", mode: "flat", value: 10 }] },
  { id: "h_s_core1", type: "small", name: "", x: 838, y: 726, stats: [{ stat: "inc_crit_chance_percent", mode: "increased", value: 8 }] },
  { id: "h_s_core2", type: "small", name: "", x: 764, y: 782, stats: [{ stat: "flat_life", mode: "flat", value: 15 }] },
  { id: "h_s_f1", type: "small", name: "", x: 934, y: 755, stats: [{ stat: "inc_life_percent", mode: "increased", value: 5 }] },
  { id: "h_s_f2", type: "small", name: "", x: 737, y: 874, stats: [{ stat: "inc_es_percent", mode: "increased", value: 5 }] },
  { id: "h_s_f3", type: "small", name: "", x: 732, y: 626, stats: [{ stat: "all_res_percent", mode: "flat", value: 4 }] },
  { id: "s_br1", type: "small", name: "", x: 991, y: 313, stats: [{ stat: "flat_dexterity", mode: "flat", value: 10 }] },
  { id: "s_br2", type: "small", name: "", x: 953, y: 493, stats: [{ stat: "inc_evasion_percent", mode: "increased", value: 8 }] },
  { id: "s_s1", type: "small", name: "", x: 735, y: 146, stats: [{ stat: "flat_dexterity", mode: "flat", value: 8 }] },
  { id: "s_s10", type: "small", name: "", x: 869, y: -75, stats: [{ stat: "flat_phys_damage", mode: "flat", value: 4 }] },
  { id: "s_s11", type: "small", name: "", x: 967, y: -54, stats: [{ stat: "inc_attack_speed_percent", mode: "increased", value: 4 }] },
  { id: "s_s12", type: "small", name: "", x: 652, y: -176, stats: [{ stat: "inc_crit_chance_percent", mode: "increased", value: 8 }] },
  { id: "s_s13", type: "small", name: "", x: 747, y: -227, stats: [{ stat: "flat_evasion", mode: "flat", value: 30 }] },
  { id: "s_s14", type: "small", name: "", x: 901, y: -211, stats: [{ stat: "inc_life_percent", mode: "increased", value: 5 }] },
  { id: "s_s2", type: "small", name: "", x: 823, y: 123, stats: [{ stat: "inc_evasion_percent", mode: "increased", value: 8 }] },
  { id: "s_s3", type: "small", name: "", x: 948, y: 178, stats: [{ stat: "inc_attack_speed_percent", mode: "increased", value: 4 }] },
  { id: "s_s4", type: "small", name: "", x: 784, y: 55, stats: [{ stat: "inc_crit_chance_percent", mode: "increased", value: 8 }] },
  { id: "s_s5", type: "small", name: "", x: 1013, y: 131, stats: [{ stat: "flat_accuracy", mode: "flat", value: 40 }] },
  { id: "s_s6", type: "small", name: "", x: 840, y: 19, stats: [{ stat: "flat_cold_res", mode: "flat", value: 8 }] },
  { id: "s_s7", type: "small", name: "", x: 620, y: -17, stats: [{ stat: "inc_evasion_percent", mode: "increased", value: 8 }] },
  { id: "s_s8", type: "small", name: "", x: 763, y: -51, stats: [{ stat: "flat_dexterity", mode: "flat", value: 8 }] },
  { id: "s_s9", type: "small", name: "", x: 768, y: 1, stats: [{ stat: "inc_crit_multi_percent", mode: "increased", value: 10 }] },
];

export const PASSIVE_EDGES: [string, string][] = [
  ["h_entry_plaguebringer", "h_n1"],
  ["h_n1", "h_k1"],
  ["h_k1", "h_s_f1"],
  ["h_s_f1", "h_entry_oracle"],
  ["h_entry_oracle", "h_n2"],
  ["h_n2", "h_k2"],
  ["h_k2", "h_s_f2"],
  ["h_s_f2", "h_entry_warlord"],
  ["h_entry_warlord", "h_n3"],
  ["h_n3", "h_k3"],
  ["h_k3", "h_s_f3"],
  ["h_s_f3", "h_entry_plaguebringer"],
  ["h_entry_plaguebringer", "h_s_core1"],
  ["h_entry_oracle", "h_s_core1"],
  ["h_s_core1", "h_s_core2"],
  ["h_entry_warlord", "h_s_core2"],
  ["h_s_core2", "h_entry_plaguebringer"],
  ["root_plaguebringer", "s_s1"],
  ["root_plaguebringer", "s_s2"],
  ["root_plaguebringer", "s_s3"],
  ["s_s1", "s_n1"],
  ["s_s2", "s_s4"],
  ["s_s4", "s_n1"],
  ["s_s3", "s_s5"],
  ["s_s5", "s_n2"],
  ["s_s4", "s_s6"],
  ["s_s6", "s_n2"],
  ["s_n1", "s_s7"],
  ["s_s7", "s_n3"],
  ["s_n2", "s_s8"],
  ["s_s8", "s_n3"],
  ["s_n1", "s_s9"],
  ["s_s9", "s_s10"],
  ["s_s10", "s_n4"],
  ["s_n2", "s_s11"],
  ["s_s11", "s_n4"],
  ["s_n3", "s_s12"],
  ["s_s12", "s_s13"],
  ["s_s13", "s_k"],
  ["s_n4", "s_s14"],
  ["s_s14", "s_k"],
  ["s_n2", "s_br1"],
  ["s_br1", "s_br2"],
  ["s_br2", "h_entry_plaguebringer"],
  ["root_oracle", "a_s1"],
  ["root_oracle", "a_s2"],
  ["root_oracle", "a_s3"],
  ["a_s1", "a_n1"],
  ["a_s2", "a_s4"],
  ["a_s4", "a_n1"],
  ["a_s3", "a_s5"],
  ["a_s5", "a_n2"],
  ["a_s4", "a_s6"],
  ["a_s6", "a_n2"],
  ["a_n1", "a_s7"],
  ["a_s7", "a_n3"],
  ["a_n2", "a_s8"],
  ["a_s8", "a_n3"],
  ["a_n1", "a_s9"],
  ["a_s9", "a_s10"],
  ["a_s10", "a_n4"],
  ["a_n2", "a_s11"],
  ["a_s11", "a_n4"],
  ["a_n3", "a_s12"],
  ["a_s12", "a_s13"],
  ["a_s13", "a_k"],
  ["a_n4", "a_s14"],
  ["a_s14", "a_k"],
  ["a_n2", "a_br1"],
  ["a_br1", "a_br2"],
  ["a_br2", "h_entry_oracle"],
  ["root_warlord", "b_s1"],
  ["root_warlord", "b_s2"],
  ["root_warlord", "b_s3"],
  ["b_s1", "b_n1"],
  ["b_s2", "b_s4"],
  ["b_s4", "b_n1"],
  ["b_s3", "b_s5"],
  ["b_s5", "b_n2"],
  ["b_s4", "b_s6"],
  ["b_s6", "b_n2"],
  ["b_n1", "b_s7"],
  ["b_s7", "b_n3"],
  ["b_n2", "b_s8"],
  ["b_s8", "b_n3"],
  ["b_n1", "b_s9"],
  ["b_s9", "b_s10"],
  ["b_s10", "b_n4"],
  ["b_n2", "b_s11"],
  ["b_s11", "b_n4"],
  ["b_n3", "b_s12"],
  ["b_s12", "b_s13"],
  ["b_s13", "b_k"],
  ["b_n4", "b_s14"],
  ["b_s14", "b_k"],
  ["b_n2", "b_br1"],
  ["b_br1", "b_br2"],
  ["b_br2", "h_entry_warlord"],
];

export const PASSIVE_TREE: PassiveTree = {
  nodes: PASSIVE_NODES,
  edges: PASSIVE_EDGES,
};

/**
 * KEYSTONE HOOKS REQUIRED IN systems/keystones.ts
 * Each of these must be implemented in the damage/defense calculator.
 * A keystone whose description implies a mechanic the calculator does not
 * implement is a shipped lie — validate:tree should fail if any hook is missing.
 *
 *  special:juggernauts_stance
 *    armour *= 1.30; maxLife *= 1.20; attackRate *= 0.75; castRate *= 0.75
 *
 *  special:perfect_aim
 *    hitChance = 1.0 (ignore accuracy vs evasion entirely); critChance = 0
 *
 *  special:elemental_dominion
 *    convert 50% of physical damage to lightning BEFORE applying increases;
 *    lightningDamageTaken *= 1.25
 *
 *  special:iron_reservation
 *    maxLife *= 1.50; maxEnergyShield *= 1.50;
 *    lifeRegen = 0; esRechargeRate = 0
 *
 *  special:zealots_creed
 *    maxFireRes = maxColdRes = maxLightningRes = 85;
 *    maxLife *= 0.50; maxEnergyShield *= 0.50
 *
 *  special:vengeful_resolve
 *    moreDamageMultiplier *= 1.35; damageTakenMultiplier *= 1.25
 *
 * Interaction check already performed: no two keystones cancel each other's
 * downside. Perfect Aim zeroes crit (it does not interact with accuracy
 * penalties elsewhere, because none exist). Iron Reservation and Zealot's
 * Creed both scale the life/ES pool and stack multiplicatively to a net
 * 0.75x pool with 85% max resists and no recovery — expensive but coherent.
 */
