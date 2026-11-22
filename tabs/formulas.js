import { el, normalizeAssetPath } from '../lib/utils.js';
import { buildCalcLauncher } from './formulas-calc.js';
import { buildShieldGraph, buildDamageGraph } from './formulas-graphs.js';
import { deriveGraphData } from './formulas-graph-data.js';
import { buildFormulaExplorer } from './formulas-explorers.js';
import { buildMonsterHitCalc } from './formulas-mob-hit.js';
import { tokenizeLine, attachTooltip, makeCollapsibleSection, buildVarLegend, buildTable } from './formulas-shared.js';
import { createFormulaBrowser, markFormulaSection, buildDamageFlow } from './formulas-layout.js';
import { createMobSpawningPage } from './formulas-mob-spawning.js';
import { createExpPage } from './formulas-exp.js';
import { createMesoPage } from './formulas-mesos.js';
import { createStatEquivalencyPage } from './formulas-stat-equivalency.js';

// Experience requirements re-derived from the current version. The startup builder fills
// levels 1-99; level 100 is the cap. See tmp/steam-tables.md.
const EXP_TABLE = (() => {
  const rows = [];
  let previous = 0;
  for (let level = 1; level <= 99; level++) {
    const third = Math.floor(level ** 2 / 3);
    const exp = level <= 5
      ? (Math.floor(level ** 2 / 2) + 15) * level
      : level <= 50
        ? (third + 19) * third
        : Math.trunc(previous * (level < 90 ? 1.0548 : 2.1));
    rows.push([level, level + 1, exp]);
    previous = exp;
  }
  return rows;
})();

// Current version citizenship thresholds from NeedContribution / NeedLevel. Contribution
// is the price of one grade; the counter resets on promotion. v1.1.0 replaced the
// NeedContribution formula with a lookup table (sub_1403166E0); see
// tmp/patch-2026-10-29-binary-diff.md.
// Grade names decoded from Grand Launch message IDs 6063-6072 (unchanged text; the IDs moved
// down by ten); see tmp/grand-launch-formulas-reverify-binary.md.
const CITIZENSHIP_GRADES = [
  [1, 0, 12, 'Traveler'], [2, 1500, 17, 'Visitor'], [3, 3500, 22, 'Helpful Stranger'],
  [4, 4000, 27, 'Recognized Guest'], [5, 4500, 32, 'Town Resident'],
  [6, 5000, 37, 'Trusted Neighbor'], [7, 5500, 42, 'Distinguished Citizen'],
  [8, 6000, 47, 'Town Patron'], [9, 6500, 52, 'Guardian of the Village'],
  [10, 8500, 57, 'Citizen of Honor'],
];

// Craft level, craft exp needed to finish that level, character level needed to move on
// to it. The exp column is GetCraftNeedEXP (0x14021C820 in v2.0.0), which takes only a level, so
// every discipline shares it; the character level column is the 5 x nextLevel the
// crafting window prints in its own tooltip (0x141188E00). Level 1 comes from the
// quest, so it has no character level of its own.
// Current version caps crafting at level 9 (raised from 8 in the 2026-11-17 v2.0.0 patch:
// GetCraftNeedEXP's bound went from 8 to 9 and the tooltip's level range from 1-7 to 1-8).
const CRAFT_LEVELS = [
  [1, 50, null], [2, 166, 10], [3, 319, 15], [4, 521, 20], [5, 787, 25],
  [6, 1138, 30], [7, 1602, 35], [8, 2214, 40], [9, 3022, 45],
];

const CRAFT_RULES = [
  ['Level 1', 'CraftExp = 50'],
  ['Level 2 to 9', 'CraftExp = trunc(PreviousLevelExp × 1.32) + 100'],
];

// Swing / Stab / Shoot / Other, read directly from the damage function in
// MapleStory.exe. '-' = that action is not reachable for the weapon type.
const WEAPON_MULTS = [
  ['1H Sword',        1.8, 1.8, '-', 1.8],
  ['2H Sword',        2.5, 2.5, '-', 2.5],
  ['1H Blunt Weapon', 2.4, 1.2, '-', 1.8],
  ['2H Blunt Weapon', 3,   2,   '-', 2.5],
  ['1H Axe',          2.4, 1.2, '-', 1.8],
  ['2H Axe',          3,   2,   '-', 2.5],
  ['Spear',           1.5, 3.5, '-', 2.5],
  ['Polearm',         3.5, 1.5, '-', 2.5],
  ['Bow',             1,   1,   2.5, 1],
  ['Crossbow',        1,   1,   2.5, 1],
  ['Claw',            1,   1,   2.5, 1],
  ['Dagger',          1,   2,   '-', 1.5],
  ['Wand',            1.8, 1.8, '-', 1.8],
  ['Staff',           1.8, 1.8, '-', 1.8],
  ['Barehanded',      1,   1,   1,   1  ],
];

// How the current client picks a basic attack's animation: a uniform draw from the list the
// weapon owns (GetAttackAction sub_14083CD20, list table 0x143AD26F0, keyed by the
// weapon's info/attack). The odds are just the make-up of that list - three swings and
// two stabs gives 60/40. See tmp/steam-weapon-actions-binary.md.
// This is the MELEE list. Bows, Crossbows and Claws have a second, ranged list at
// 0x143AD28A0 (sub_14083D100, called from the shoot routine at 0x142927A31) which is what
// a normal shot actually uses - bow shoot1, crossbow shoot2, claw swingO1/O2/O3.
// Those three weapons' rows below describe melee attacks, including attacks without ammo.
const ACTION_SPLIT = [
  ['1H Sword / Axe / Blunt', '60%', '40%'],
  ['2H Sword / Axe / Blunt', '60%', '40%'],
  ['Spear / Polearm',        '60%', '40%'],
  ['Dagger',                 '60%', '40%'],
  ['Crossbow',               '50%', '50%'],
  ['Bow',                    '100%', '-'],
  ['Wand / Staff',           '100%', '-'],
  ['Claw',                   '-',   '100%'],
  ['Barehanded',             '-',   '100%'],
];

// Current skills whose multiplier category stays fixed, even if the animation can vary.
// Derived from the action classifier sub_1402A37F0, whose order is:
// skill property 48 -> use the weapon's default action; property 123 -> Other; then the
// action id ranges. Property 123 outranks the animation. Savage Blow (action 47) and
// the legacy Avenger animation (action 48) are
// hand-patched into the melee ranges by the same function.
// Magic damage does not use a weapon multiplier.
// Current skill definitions and action registrations re-read from the installed Steam client.
// Threaten and Slow are debuffs; Poison Breath's damage uses the magic path. Their Default
// labels describe the classifier, not a weapon multiplier applied to their damage.
// See tmp/steam-weapon-actions-binary.md. Third-job COT2 examples are absent from this pack.
const ACTION_EXCEPTIONS = [
  ['Stab', ['Double Stab', 'Savage Blow']],
  ['Other', ['Rush']],
  ["Weapon's Default", ['Threaten', 'Slow', 'Poison Breath', 'Arrow Bomb: Bow']],
];

// ─── Accuracy ────────────────────────────────────────────────

// Read directly from the hit-test routine in MapleStory.exe. Physical and magic
// share one hit-test routine. Skills whose additional_process list contains 128
// skip it entirely - the current pack contains Threaten and both versions of Slow.
const ACCURACY_STEPS = [
  {
    label: 'Base Accuracy & Avoidability',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics. Magicians scale Accuracy with INT instead of DEX.',
    lines: [
      'Common = Dex × 1.2 + Level × 2 + Luk × 0.6',
      '',
      'Beginner: Acc = trunc(Common / 2.5 + 5)',
      'Warrior: Acc = trunc(Common / 2.5 + 10)',
      'Magician: Acc = trunc((Int × 1.2 + Level × 2 + Luk × 0.6) / 5.1 + 20)',
      'Bowman: Acc = trunc(Common / 4.8 + 20)',
      'Thief: Acc = trunc(Common / 4 + 15)',
      '',
      'Avoid = trunc(Luk / 3) + trunc(Dex / 6) + 5',
    ],
    notes: [
      'Every stat here is your total stat including equipment and buffs, not base AP alone.',
    ],
    cot1: {
      notes: [
        'COT1 used one classless formula with no level term: Acc = Dex / 3 + Luk / 6 + 5. The five per-class formulas and the level scaling are new.',
      ],
    },
  },
  {
    label: 'Physical & Magical Accuracy',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'BaseChance = Acc × 100 / ((max(0, LevelDiff) × 2 + 51) × 5)',
      '',
      'Spread = 0.15 + 0.2 / (1 + exp((BaseChance − Avoid) / 12))',
      '',
      'Roll = rand(1 − Spread, 1 + Spread)',
      '',
      'DidHit = Roll × BaseChance ≥ Avoid',
      '',
      'HitChance = clamp(((1 + Spread) − (Avoid / BaseChance)) / (2 × Spread), 0, 1)',
    ],
    notes: [
      'exp() is the exponential function.',
      'Threaten and both versions of Slow bypass accuracy and use their own success rate. No currently available attack skill is exempt.',
      'Auto-hits when BaseChance − Avoid ≥ 25 + LevelDiff × (Level / 2 + 15).',
      'A separate miss-chance debuff is rolled after a successful hit and can still turn it into a miss.',
    ],
    cot1: {
      notes: [
        'In COT1 magic skipped the hit test entirely and always hit. The shared physical/magic check is new.',
        'COT1\'s denominator was (LevelDiff + 51) × 5 — the ×2 on the level difference doubled the out-levelling penalty.',
        'COT1\'s spread was 0.05 + 0.3 / (1 + exp(...)): a tighter band at high accuracy, so capping hit chance was cheaper.',
        'COT1\'s auto-hit cutoff was a flat 25 with no level term, and the forced-miss debuff roll did not exist.',
      ],
    },
  },
];

const ACCURACY_VARS = [
  { name: 'Acc',       desc: "Player's Accuracy stat value (shared by both physical and magic attacks)" },
  { name: 'Dex',       desc: "Player's total DEX, including equipment and buffs" },
  { name: 'Int',       desc: "Player's total INT, including equipment and buffs" },
  { name: 'Luk',       desc: "Player's total LUK, including equipment and buffs" },
  { name: 'Avoid',     desc: "Enemy's Avoid stat value" },
  { name: 'Level',     desc: "Player's level" },
  { name: 'LevelDiff', desc: 'Enemy level minus player level, or 0 if player level ≥ enemy level' },
];

// ─── Base Damage ──────────────────────────────────────────────

const BASE_DAMAGE_STEPS = [
  {
    label: 'Physical Damage',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    // Shown by default. StatDiv 100 / AtkDiv 50 covers every attack except Prone Stab
    // and meleeing with a Bow, Crossbow or Claw, so folding them in recovers the plain
    // form. Nothing here is an approximation - it is the general form with the two rare
    // branches substituted.
    simple: {
      lines: [
        'StatRoll = rand(PrimaryStat × MasteryMult, PrimaryStat)',
        'BaseRoll = rand(0.8, 1.0)',
        '',
        'Damage = SkillMult × (BaseRoll + (StatRoll × WepMult + SecondaryStat) / 100 + AttackPower / 50) × WeaponAttack',
      ],
      notes: [
        'StatRoll and BaseRoll are separate rolls: a hit can land low on one and high on the other, so damage clusters toward the middle.',
        'WepMult is chosen by the attack action, not by the skill — see the Weapon Multipliers table. Lucky Seven overrides it to 3.0.',
        'Combo Attack and Elemental Charge raise Skill Damage % before anything else happens — see Damage Modifications.',
        'Weapon Attack and Attack Power are separate equipment stats, split by stat, not by slot. Gloves Attack scrolls add Weapon Attack, the same stat as weapon scrolls, so they multiply the whole formula.',
      ],
    },
    lines: [
      'StatDiv = 300  if Prone Stab (any weapon)',
      '          300  if Bow / Crossbow / Claw and the action is Swing, Stab or Other',
      '          100  otherwise (incl. Bow / Crossbow / Claw on Shoot)',
      '',
      'AtkDiv  = 150  if Prone Stab (any weapon)',
      '          150  if Bow / Crossbow / Claw and the action is Swing or Other',
      '           50  otherwise (incl. their Stab, and Shoot)',
      '',
      'StatRoll = rand(PrimaryStat × MasteryMult, PrimaryStat)',
      'BaseRoll = rand(0.8, 1.0)',
      '',
      'Damage = SkillMult × (BaseRoll + (StatRoll × WepMult + SecondaryStat) / StatDiv + AttackPower / AtkDiv) × WeaponAttack',
      '',
      'Prone Stab    replaces 0.8 and 1.0 with 0.2 and 0.3, and forces WepMult = 1',
      'Lucky Seven   forces WepMult = 3.0 in place of the Claw Shoot 2.5',
    ],
    notes: [
      'StatRoll and BaseRoll are separate rolls: a hit can land low on one and high on the other, so damage clusters toward the middle.',
      'With the usual StatDiv of 100 and AtkDiv of 50, this reduces to the simple form.',
      'WepMult is chosen by the attack action, not by the skill — see the Weapon Multipliers table.',
      'Normal Bow, Crossbow, and Claw shots use Shoot (2.5, StatDiv 100). The StatDiv 300 rows apply when meleeing with them — for example, stabbing with a Claw when out of stars (1.0).',
      'Combo Attack and Elemental Charge both raise Skill Damage % before anything else happens — see Damage Modifications.',
    ],
    cot2: { notes: ['MasteryMult uses a factor of 0.7 instead of 0.8, a 12.5% decrease at every mastery level. At mastery 10, the multiplier is 0.77 instead of 0.88, so minimum physical damage drops slightly.'] },
    cot1: {
      notes: [
        'Only Lucky Seven changed: COT1 forced a 2.6 weapon multiplier, raised to 3.0 in COT2.',
      ],
    },
  },
  {
    label: 'Magical Damage',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics. Your MAGIC stat equals floor(TotalInt / 2) plus equipment and buff Magic Attack.',
    lines: [
      'MIN = (BasicAttack / 100) × (floor(TotalInt / 2) + MagicAttack) × (TotalInt × MasteryMult / 125 + 1)',
      'MAX = (BasicAttack / 100) × (floor(TotalInt / 2) + MagicAttack) × (TotalInt / 125 + 1)',
    ],
    warnings: [
      'MagicAttack includes equipment and buffs.',
    ],
    cot2: { notes: ['MasteryMult uses a factor of 0.7 instead of 0.8, a 12.5% decrease at every mastery level. At mastery 10, the multiplier is 0.77 instead of 0.88, so minimum magical damage drops slightly.', 'Compared with COT2, INT contributes less to both minimum and maximum damage (divisor 125 instead of 100).'] },
    notes: [
      'Damage rolls uniformly between MIN and MAX on each hit.',
      'BasicAttack is the value listed on the skill. Exceptions: Poison Mist (pure damage over time), Poison Breath (uses a separate direct-hit value), and Heal (uses its own formula).',
    ],
    cot1: {
      notes: [
        'Rewritten since COT1, which used (BasicAttack + Magic / 7) × ((Magic × 2 × MasteryMult + BaseInt) / 100 + 1) — and read base INT only, so INT from equipment did not count in the bracket.',
      ],
    },
  },
  {
    label: 'Meso Explosion',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics; not yet tested in-game.',
    lines: [
      'MAX = MasteryPercent × 5 × (1 + MesosPerPile / (MesosPerPile + 10))',
      'MIN = MAX / 2',
    ],
    notes: [
      'Rolled separately for each exploded pile; total damage is the sum across piles.',
      'Larger piles quickly give diminishing returns.',
    ],
  },
  {
    label: 'Heal',
    wip: false,
    status: 'partial',
    statusNote: 'Undead damage formula is confirmed. HP restored to players and exact target-selection rules still need confirmation.',
    lines: [
      'HealBase = ((TotalInt × Roll + TotalLuk) / 1000 + 2.5) × (floor(TotalInt / 2) + MagicAttack) × (RecoveryRate / 100) × ((TargetsHit − 1) × 0.5 + 1)',
      '',
      'Roll = rand(0.1, 1.2)',
      '',
      'Damage = trunc(HealBase) / TargetsHit / 1.5',
    ],
    warnings: [
      'MagicAttack includes equipment and buffs.',
    ],
    notes: [
      'This calculates damage against undead, not HP restored to party members.',
      'RecoveryRate is the recovery rate listed on the skill itself.',
      'TargetsHit counts players and undead monsters hit. The calculator assumes 6 shared targets (including you); exact target-selection priority still needs confirmation.',
    ],
    cot2: {
      notes: [
        'COT2 applied a Bless bonus multiplier to undead damage; this version does not.',
        'Higher INT/LUK and Bless favored COT2, while this version retains more damage per undead target when hitting larger groups.',
      ],
    },
    cot1: {
      notes: [
        'Same shape as COT1, but COT1 read base INT and base LUK from AP only — using total stats including equipment is new.',
      ],
    },
  },
  {
    label: 'Damage Over Time (DoT)',
    wip: false,
    status: 'partial',
    statusNote: 'Total damage is verified. Per-tick damage is an even-split estimate based on skill duration.',
    lines: [
      'TotalDamage = (DoTBasicAttack / 100) × (floor(TotalInt / 2) + MagicAttack) × (TotalInt / 125 + 1)',
      '',
      'EstimatedDamagePerTick = TotalDamage / DoTDurationSeconds',
    ],
    warnings: [
      'MagicAttack includes equipment and buffs.',
    ],
    notes: [
      'DoT damage ignores all enemy Weapon and Magic Defense.',
      'DoT skills tick once per second. The per-tick line estimates an even split across the duration; exact per-tick rounding is handled server-side.',
      'The Level Difference Penalty applies the same way as for direct hits.',
    ],
    cot1: {
      notes: [
        'Rewritten since COT1, which used (DoTBasicAttack + Magic / 7) × ((Magic + BaseInt) / 100 + 1) with base INT and a divisor of 100 — the 125 divisor is new.',
      ],
    },
  },
  {
    label: 'Bleed (Physical Damage Over Time)',
    wip: false,
    status: 'partial',
    statusNote: 'Total damage is verified. Per-tick damage is an even-split estimate based on skill duration.',
    lines: [
      'TotalDamage = (BleedPercent / 100) × ((2 × PrimaryStat + SecondaryStat) / 100 + 1 + AttackPower / 50) × WeaponAttack',
      '',
      'EstimatedDamagePerTick = TotalDamage / BleedDurationSeconds',
    ],
    notes: [
      'Bleed ignores all enemy Weapon and Magic Defense.',
      'The Level Difference Penalty applies the same way as for direct hits.',
    ],
    cot1: {
      notes: [
        
      ],
    },
  },
];

const BASE_DAMAGE_VARS = [
  { name: 'SkillMult',     desc: 'Skill Damage % as a decimal (e.g. 120% → 1.2)' },
  { name: 'PrimaryStat',   desc: 'Set by weapon type:\nStr - Melee Weapons (1H/2H Swords, Axes, Blunt Weapons, Spears, Polearms, Barehands, and Staves/Wands while whacking)\nDex - Bows and Crossbows\nLuk - Daggers and Claws' },
  { name: 'SecondaryStat', desc: 'Set by weapon type:\nDex - Melee Weapons\nStr - Bows and Crossbows\nStr + Dex - Daggers and Claws' },
  { name: 'AttackPower',   desc: 'Attack Power from buffs such as Rage and the Warrior Potion, plus any equipment listing "Attack Power" on its tooltip. No current equipment does' },
  { name: 'WeaponAttack',  desc: 'Weapon Attack from all equipment, whatever the slot: the weapon, and gloves or other gear scrolled for attack. Plus Stars and Arrows, and 5 if barehanded' },
  { name: 'WepMult',       desc: 'Weapon multiplier for the attack action used — see Weapon Multipliers table' },
  { name: 'StatDiv',       desc: 'Divides both stat terms. Determined by weapon type and attack action — see Physical Damage (Advanced)' },
  { name: 'AtkDiv',        desc: 'Divides the AttackPower term. Determined the same way as StatDiv — see Physical Damage (Advanced)' },
  { name: 'MasteryMult',   desc: '(0.1 + MasteryLevel / 10) × 0.7 (level 0 if unlearned). Physical attacks use your equipped weapon mastery; magic attacks use the spell\'s own mastery. Lucky Seven uses its own skill-specific multiplier instead.' },
  { name: 'BasicAttack',   desc: 'Basic Attack value listed on the skill, for magic skills only' },
  { name: 'DoTBasicAttack', desc: 'The "deals N Basic Attack over X sec" value listed on the skill' },
  { name: 'BleedPercent', desc: 'The "dealing N% total damage over X sec" value listed on the skill: 40% at Lv. 1 rising to 100% at Lv. 20 for Axe Mastery' },
  { name: 'BleedDurationSeconds', desc: 'Duration of the bleed effect in seconds (3s for Axe Mastery, ticking once per second)' },
  { name: 'MagicAttack',    desc: 'Total Magic Attack from equipment, scrolls, and buffs (excluding INT)' },
  { name: 'TotalInt',      desc: 'Total INT, including equipment and buffs' },
  { name: 'TotalLuk',      desc: 'Total LUK, including equipment and buffs' },
  { name: 'MesosPerPile',  desc: 'Mesos in a single exploded ground pile' },
  { name: 'MasteryPercent', desc: 'Meso Explosion skill mastery % (e.g. 150 for 150%)' },
  { name: 'RecoveryRate',  desc: 'Heal skill recovery rate %' },
  { name: 'TargetsHit',    desc: 'Total targets hit: players and undead monsters share up to 6 slots, including the caster even at full HP' },
  { name: 'DoTDurationSeconds', desc: 'Duration of the DoT effect in seconds' },
];

// ─── Damage Modifications ─────────────────────────────────────

const MOD_PIPELINE_STEPS = [
  {
    label: 'Combo Attack (Crusader)',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'ComboBonus = 5 × Orbs × (Orbs − 1)   for Panic and Coma',
      'ComboBonus = ComboDamage             for every other skill',
      '',
      'SkillMult = SkillMult × (ComboBonus / 100 + 1)',
    ],
    notes: [
      'Only applies while Combo Attack is active with at least one orb stacked.',
      'ComboDamage is Combo Attack\'s listed damage bonus: 5% at Lv. 1 rising to 20% at Lv. 30.',
      'Panic and Coma scale off orb count instead: at 1 to 5 orbs, the bonus is 0%, 10%, 30%, 60%, and 100% (×1.0, ×1.1, ×1.3, ×1.6, and ×2.0).',
      'Applied to Skill Damage % before base damage is calculated, multiplying the whole hit.',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Combo Attack did not exist in COT1.',
      ],
    },
  },
  {
    label: 'Elemental Charge (White Knight)',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'SkillMult = SkillMult × (ChargeDamage / 100 + 1)',
    ],
    notes: [
      'Only applies while an elemental charge is active.',
      'ChargeDamage is the active charge skill\'s damage bonus: 2% at Lv. 1 rising to 20% at Lv. 30 (same for Fire, Ice, and Lightning Charge).',
      'Like Combo Attack, this applies to Skill Damage % before base damage is calculated.',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Elemental Charge skills did not exist in COT1.',
      ],
    },
  },
  {
    label: 'Defense Nullified (Armor Crash)',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from game mechanics: Armor Crash sets the monster\'s physical defense to 0.',
    lines: [
      'While Armor Crash is active on the monster, WeaponDefense = 0 and the defense step below is skipped.',
    ],
    notes: [
      'Armor Crash sets a monster\'s Physical Defense directly to 0 rather than reducing it by a percentage.',
      'Physical defense only — Magic Defense is unaffected.',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Armor Crash did not exist in COT1.',
      ],
    },
  },
  {
    label: 'Weapon Defense',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'WeaponDefense = max(0, trunc(BaseWeaponDefense × (PercentEffects / 100 + 1)) + FlatEffects)',
      '',
      'Damage = Damage × 100 / (WeaponDefense + 100)',
    ],
    notes: [
      'trunc() rounds toward zero (down for positive, up for negative).',
      'Applies to Physical damage only.',
      'This is for monsters only. Damage taken by players uses a different formula — see the Damage Taken section.',
      'PercentEffects and FlatEffects are applied separately — Threaten and Disorder are the skills that lower a monster\'s Weapon Defense.',
      'Blunt Weapon Mastery and Crossbow Mastery roll their Ignore Defense chance once per attack. When it triggers, WeaponDefense is treated as 0 for every hit in that attack.',
    ],
    cot1: {
      notes: [
        'The formula is unchanged from COT1, but Blunt Weapon Mastery\'s Ignore Defense proc is new (in COT1 it was a stun passive).',
      ],
    },
  },
  {
    label: 'Magic Defense',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'MagicDefense = max(0, trunc(BaseMagicDefense × (PercentEffects / 100 + 1)) + FlatEffects)',
      '',
      'Damage = Damage × 100 / (MagicDefense + 100)',
    ],
    notes: [
      'Applies to Magical damage only.',
      'Uses the same formula as Weapon Defense.',
      'This is for monsters only. Damage taken by players uses a different formula — see the Damage Taken section.',
      'No current skill lowers Magic Defense, so this uses the monster\'s listed Magic Defense.',
      'There is no Ignore Defense proc for magic, and no magic equivalent of Armor Crash.',
    ],
    cot1: {
      notes: [
        'COT1 used the base stat directly without modifier support.',
      ],
    },
  },
  {
    label: 'Elemental Modifier',
    wip: false,
    status: 'ok',
    statusNote: 'Confirmed: elemental damage uses the monster\'s resistance to the attack\'s element.',
    lines: [
      'Damage = Damage × ElementalMult',
      '',
      'An attack with one element:',
      '  0.0  - immune',
      '  0.75 - resistant',
      '  1.0  - neutral',
      '  1.25 - weak against element',
      '',
      'An attack with two elements:',
      '  ElementalMult = 0.25 × (Resistance(Element1) + Resistance(Element2))',
      '  Resistance = 0 immune, 1 resistant, 2 neutral, 3 weak',
    ],
    notes: [
      'Only two skills carry two elements: Element Composition (Fire/Poison and Ice/Lightning).',
      'Only dual-element attacks can reach 0.25, 0.5, or 1.5 (1.5 against monsters weak to both elements, 0.0 if immune to both).',
      'Anything outside these values defaults to 1.0.',
    ],
    cot1: {
      notes: [
        'COT1 only had the four single-element multipliers (0, 0.75, 1.0, 1.25). Element Composition and dual-element blending are new.',
      ],
    },
  },
  {
    label: 'Level Difference Penalty',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics across direct hits, DoT, and Bleed.',
    lines: [
      'LevelDiff = EnemyLevel − PlayerLevel',
      '',
      'No penalty if LevelDiff ≤ 0',
      '',
      'LevelDiff < 10:  Damage = Damage / (LevelDiff² × 0.005 + 1)',
      'LevelDiff ≥ 10:  Damage = Damage / (LevelDiff × 0.05 + 1)',
    ],
    notes: [
      'Both branches meet at LevelDiff 10, where damage is divided by 1.5 (about a third lost).',
      'Applies to direct hits, DoT, and Bleed alike. Before the November 17, 2026 patch, DoT and Bleed used the linear LevelDiff × 0.05 formula at every level difference, dealing less damage against enemies 1–9 levels above you.',
    ],
  },
  {
    label: 'Element Amplification',
    wip: false,
    status: 'stale',
    statusNote: 'Supported by game mechanics, though the Element Amplification skill is not currently available.',
    lines: [
      'Damage = Damage × (ElementAmpDamage / 100 + 1)',
    ],
    notes: [
    ],
  },
  {
    label: 'Critical Hit',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics across physical, magic, and DoT attacks.',
    lines: [
      'IsCrit = rand(0, 99) < CritRate',
      '',
      'Damage = Damage × (100 + CritDamage) / 100',
    ],
    notes: [
      'CritRate and CritDamage are the values shown in your Stats panel.',
      'Power Knockback always crits regardless of your CritRate, matching its skill description.',
      'DoT and Bleed damage can also crit.',
    ],
  },
  {
    label: 'Iron Arrow Falloff (Crossbow only)',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from current game mechanics.',
    lines: [
      'Damage = Damage × 0.8^ConsecutiveHits',
      '  1st mob: ×1.0,  2nd: ×0.8,  3rd: ×0.64,  4th: ×0.512,  5th: ×0.4096,  6th: ×0.32768',
    ],
    notes: [
      'Applies only to Iron Arrow: Crossbow.',
      'Hits up to 6 targets at every level. Each subsequent target takes 80% of the previous target\'s damage.',
    ],
    cot2: { notes: [
      'The target cap rose from 4 to 6, so the 5th and 6th monsters are now hit as well.',
      'The 3rd and 4th targets take more damage: falloff changed from linear (×0.60, ×0.40) to geometric (×0.64, ×0.512).',
    ] },
  },
  {
    label: 'Shadow Partner (Hermit)',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from game mechanics, though 3rd job Shadow Partner is not yet available.',
    lines: [
      'Damage = Damage × PartnerDamage / 100',
      '  applied only to hits in the second half of the hit list',
    ],
    notes: [
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Shadow Partner did not exist in COT1.',
      ],
    },
  },
  {
    label: 'Physical Immunity',
    wip: false,
    status: 'partial',
    statusNote: 'Verified from game mechanics for physical hits, Meso Explosion, and DoT. The buffs that bypass it are not yet identified.',
    lines: [
      'If the monster is physically immune and you have neither bypass buff:',
      '  Damage = PImmuneDamage',
    ],
    notes: [
      'A monster becomes physically immune while its physical-immunity buff is active. Faust is currently the only monster with this skill (5s duration, 60s cooldown); no monster is permanently immune.',
      'While immune, each physical hit deals 1 damage (skipping criticals, Iron Arrow falloff, Shadow Partner, and the normal clamp).',
      'A separate bypass stat can give hits a chance to pierce temporary physical immunity, though no current player buff is confirmed to grant it.',
      'Magic attacks are unaffected by physical immunity.',
    ],
    cot2: { notes: ['New since COT2. Earlier versions did not apply physical immunity to damage calculations.'] },
  },
  {
    label: 'Clamp',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'Damage = trunc(Damage)',
      'Damage = clamp(Damage, 1, 99,999)',
    ],
    notes: [
      'Any hit that passes accuracy deals at least 1 damage and at most 99,999.',
    ],
    cot1: {
      notes: [
        'COT1\'s cap was 700,000,000,000. The 99,999 cap was introduced in COT2.',
      ],
    },
  },
];

const MOD_VARS = [
  { name: 'BaseWeaponDefense', desc: "Enemy's weapon defense stat, before modifiers" },
  { name: 'BaseMagicDefense',  desc: "Enemy's magic defense stat, before modifiers" },
  { name: 'WeaponDefense',   desc: "Enemy's weapon defense after percent and flat modifiers, floored at 0" },
  { name: 'MagicDefense',    desc: "Enemy's magic defense after percent and flat modifiers, floored at 0" },
  { name: 'PercentEffects',  desc: "Percentage modifiers to the monster's defense (such as Threaten's -2% to -10% Weapon Defense debuff; none currently affect Magic Defense)" },
  { name: 'FlatEffects',     desc: "Flat modifiers to the monster's defense, added after percentage modifiers (such as Disorder on Weapon Defense; none currently affect Magic Defense)" },
  { name: 'ElementalMult',   desc: "Elemental multiplier from the monster's resistance: 0.0, 0.75, 1.0, or 1.25 for single-element attacks, and 0.0 to 1.5 in 0.25 steps for Element Composition" },
  { name: 'EnemyLevel',      desc: "Enemy's level" },
  { name: 'PlayerLevel',     desc: "Player's level" },
  { name: 'LevelDiff',       desc: 'Enemy level minus player level. No penalty when this is 0 or below' },
  { name: 'CritRate',        desc: 'Critical hit rate % from the Stats panel' },
  { name: 'CritDamage',      desc: 'Critical damage % from the Stats panel (e.g. 20 → a ×1.2 multiplier)' },
  { name: 'ConsecutiveHits', desc: 'Iron Arrow: 0 for first mob hit, 1 for second, etc.' },
  { name: 'PartnerDamage',   desc: "Shadow Partner's damage %" },
  { name: 'SkillMult',       desc: 'Skill Damage % as a decimal, the same value the Base Damage formulas use' },
  { name: 'Orbs',            desc: 'Combo Attack orbs stacked when the skill is cast, 1 to 5' },
  { name: 'ComboDamage',     desc: "Combo Attack's damage bonus % for the learned level (5% at Lv. 1, 20% at Lv. 30)" },
  { name: 'ChargeDamage',    desc: "The active elemental charge's damage bonus % for the learned level (2% at Lv. 1, 20% at Lv. 30)" },
  { name: 'ElementAmpDamage', desc: "Damage bonus % from Element Amplification (magic and DoT only; skill not currently available)" },
  { name: 'PImmuneDamage',   desc: "Damage dealt per hit to a physically immune monster (defaults to 1)" },
];

// ─── Damage taken ─────────────────────────────────────────────

const GUARD_STEPS = [
  {
    label: 'Monster Accuracy',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'LevelGap = PlayerLevel − MonsterLevel, or 0 if the monster is the higher level',
      '',
      'MonsterHitScore = MonsterAcc × 100 / ((LevelGap + 51) × 5)',
      '',
      'EffectiveAvoid = Avoid / (Avoid / 80 + 1) / (LevelGap / 40 + 1)',
      '',
      'Spread = 0.15 + 0.2 / (1 + exp((MonsterHitScore − EffectiveAvoid) / 12))',
      'Roll   = rand(1 − Spread, 1 + Spread)',
      '',
      'Hit if Roll × MonsterHitScore ≥ EffectiveAvoid',
      'RollHitChance = clamp(((1 + Spread) − (EffectiveAvoid / MonsterHitScore)) / (2 × Spread), 0, 1)',
      '',
      'If the ordinary roll fails and EffectiveAvoid > (1 + Spread) × MonsterHitScore:',
      '  Diff = MonsterHitScore − EffectiveAvoid',
      '  RescueChance = clamp(0.03 × exp(Diff / 18), 0.02, 0.03)',
      '  Hit if rand(0, 1) < RescueChance',
      '',
      'If still missed: a separate fallback hits 8% of the time.',
    ],
    notes: [
      'Avoid has hard diminishing returns: dividing by Avoid / 80 + 1 means your effective Avoid approaches 80 and never exceeds it, no matter how much Avoid you stack.',
      'Out-levelling lowers both the monster\'s hit score and your effective Avoid. In some cases this can raise hit probability — for example, 100 MonsterAcc vs. 100 Avoid gives roughly 25.4%, 39.9%, and 50.5% at level gaps of 0, 20, and 50 (before fallback chances).',
      'Overall hit chance before guards is RollHitChance + (1 − RollHitChance) × (RescueChance + (1 − RescueChance) × 0.08), with RescueChance = 0 unless your Avoid exceeds the roll\'s maximum reach.',
      'When your Avoid is out of roll reach, the rescue check runs before the 8% fallback, giving a combined minimum hit chance between 9.84% and 10.76%.',
      'Some initially successful hits face an extra 50% miss check (which attacks trigger it still needs confirmation). Hits recovered by the fallback chances skip this check.',
      'Unmissable attacks skip this accuracy check, but can still be guarded below.',
    ],
  },
  {
    label: 'Guard Immunity',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from game mechanics: certain obstacles bypass shield and claw guards.',
    lines: [
      'Invincible obstacles (such as jump-quest hazards) bypass guard checks.',
    ],
    notes: [
      'After accuracy succeeds, guard-immune attacks skip Shield Guard and Claw Guard checks.',
      'Currently this only applies to jump-quest obstacles, whose attacks cannot be guarded.',
    ],
  },
  {
    label: 'Shield Guard',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'ShieldDefense = Weapon Defense on the item in the shield slot',
      '',
      'Only rolled if ShieldDefense > 0:',
      '  GuardChance = max(0.05, ShieldDefense / (ShieldDefense + 500))',
      '',
      'Guarded = GuardChance > rand(0, 1)',
    ],
    notes: [
      'Only the shield slot counts. Weapon Defense from armor, accessories, buffs, or skills does not increase guard chance.',
      'Any shield gives at least a 5% guard chance, reaching 50% at 500 shield Weapon Defense.',
      'Scrolled Weapon Defense on the shield counts.',
    ],
  },
  {
    label: 'Claw Guard',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'Only rolled for Assassin, Hermit and Night Lord:',
      '  Guarded = ClawGuardBlockChance / 100 > rand(0, 1)',
    ],
    notes: [
      'ClawGuardBlockChance is the block chance listed on the skill: 3% at Lv. 1–6, 4% at Lv. 7–13, and 5% at Lv. 14–20.',
      'Shares the Shield Guard roll and only runs if Shield Guard didn\'t trigger — so equipping any shield (≥ 5% guard) prevents Claw Guard from ever firing. Only claw setups without a shield benefit.',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Claw Guard did not exist in COT1. Shields were the only way to guard.',
      ],
    },
  },
  {
    label: 'Incoming Damage',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from current game mechanics.',
    lines: [
      'IncomingDamage = MonsterAttack × (1.2 + 0.2 × rand(0, 1))',
    ],
    notes: [
      "MonsterAttack is the monster's physical attack for a regular attack, or magic attack for a skill attack, after its own modifiers.",
      'Every hit lands between 1.2× and 1.4× the monster\'s attack.',
    ],
    cot2: { notes: ['The damage range is narrower than COT2 (1.1× to 1.5×). The average hit is unchanged at 1.3×, with smaller swings between minimum and maximum hits.'] },
  },
  {
    label: 'Player Defense',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from current game mechanics.',
    lines: [
      'Defense = WeaponDefense for a regular attack, MagicDefense for a skill attack',
      '',
      'DamageTaken = IncomingDamage × (1 − Defense / (Defense + 2 × IncomingDamage + 300)) − Defense / 25 − PlayerLevel / 10',
    ],
    notes: [
      'Replaces the COT2 defense scale formula. Defense now reduces damage through both a percentage reduction and flat Defense/25 and Level/10 subtractions.',
      'The result is truncated and clamped to 1–50,000,000 at the final step.',
    ],
    cot2: { notes: ['Smaller hits benefit more from the new flat Defense/25 and Level/10 reductions. Against very large hits, COT2\'s percentage reduction could be stronger.'] },
    cot1: {
      notes: [
        'COT1 and COT2 used different formulas. The current game uses the formula above.',
      ],
    },
  },
  {
    label: 'Invincible (Cleric)',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'Only for Cleric, Priest and Bishop, and only against a regular attack:',
      '  DamageTaken = DamageTaken × (1 − InvincibleReduction / 100)',
    ],
    notes: [
      'InvincibleReduction is the skill\'s listed reduction: 1% at Lv. 1 rising to 20% at Lv. 20.',
      'Applies to regular physical attacks only; monster skill attacks bypass it.',
    ],
    cot2: { notes: ['Invincible reduces less physical damage at every skill level: 1–20% instead of COT2’s 10–30%.'] },
  },
  {
    label: 'Elemental Damage Reduction',
    wip: false,
    status: 'partial',
    statusNote: 'Elemental damage reduction formula is confirmed.',
    lines: [
      'DamageTaken = DamageTaken × (1 − ElementResist / 100)',
    ],
    notes: [
      'Applies to both regular and skill attacks when ElementResist is positive, straight after player defense.',
    ],
  },
  {
    label: 'Result',
    wip: false,
    status: 'stale',
    statusNote: 'Verified from game mechanics.',
    lines: [
      'DamageTaken = clamp(DamageTaken, 1, 50000000), truncated',
      '',
      'DamageTaken = 0 if the hit missed or was guarded',
    ],
    notes: [
      'Any hit that lands deals at least 1 damage, no matter how high your defense is.',
      'Guarding completely negates the hit (0 damage taken), just like a miss.',
      'Guard only applies to regular monster attacks — monster skill attacks cannot be guarded.',
      'Unmissable attacks can still be guarded, since guard checks run after accuracy.',
      'Fixed-damage attacks ignore player defense and this clamp; this step covers ordinary monster hits.',
    ],
  },
];

const GUARD_VARS = [
  { name: 'MonsterAcc',    desc: "The monster's accuracy stat" },
  { name: 'MonsterLevel',  desc: "The monster's level" },
  { name: 'LevelGap',      desc: 'Your level minus the monster\'s level, or 0 if the monster is the higher level' },
  { name: 'Avoid',         desc: "Your Avoid stat from the Stats panel, before diminishing returns" },
  { name: 'EffectiveAvoid', desc: 'Avoid after diminishing returns and level-gap scaling (approaches 80 and never exceeds it)' },
  { name: 'MonsterHitScore', desc: "The monster's accuracy scaled against the level gap" },
  { name: 'Diff',          desc: 'MonsterHitScore minus EffectiveAvoid, used in the out-of-reach rescue chance' },
  { name: 'RescueChance',  desc: 'Chance for a failed accuracy roll to still hit when Avoid exceeds maximum roll reach; checked before the 8% fallback' },
  { name: 'InvincibleReduction', desc: "Invincible's damage reduction % for the learned level (1% at Lv. 1, 20% at Lv. 20)" },
  { name: 'ElementResist', desc: 'Percentage damage reduction for the incoming attack\'s element' },
  { name: 'ShieldDefense', desc: 'Weapon Defense of the item equipped in the shield slot, including scrolls' },
  { name: 'GuardChance',   desc: 'Chance for the hit to be negated outright' },
  { name: 'ClawGuardBlockChance', desc: "Claw Guard's block chance for the learned level (3%, 4%, or 5%)" },
  { name: 'MonsterAttack', desc: "The monster's physical attack (regular attack) or magic attack (skill attack), after modifiers" },
  { name: 'IncomingDamage', desc: 'The rolled damage of the hit, before player defense is applied' },
  { name: 'Defense',       desc: "The player's Weapon Defense against a regular attack, or Magic Defense against a skill attack, from the Stats panel" },
  { name: 'DefenseDenominator', desc: 'Defense + 2 × IncomingDamage + 300 in the current player defense formula' },
  { name: 'PlayerLevel',   desc: "Player's level" },
  { name: 'DamageTaken',   desc: 'HP actually lost from the hit' },
];

// ─── Shared helpers ───────────────────────────────────────────

const STATUS_LABELS = { ok: 'Verified', partial: 'Partly Verified', warn: 'Educated Guess', stale: 'Verified' };

// Binary verification is shown directly. Gameplay confirmation is an additional
// badge only when explicitly recorded.
function makeStatusTag(status, statusNote, validated) {
  const frag = document.createDocumentFragment();
  const statusClass = status === 'stale' ? 'ok' : status;
  const statusTag = el('span', { className: `formulas-status-tag formulas-status-${statusClass}`, textContent: STATUS_LABELS[status] });
  attachTooltip(statusTag, statusNote ?? (status === 'ok' || status === 'stale' ? 'Verified from game mechanics.' : null));
  frag.appendChild(statusTag);

  if (status !== 'warn' && validated === true) {
    const validationTag = el('span', {
      className: 'formulas-status-tag formulas-validation-done',
      textContent: 'In-Game Confirmed',
    });
    attachTooltip(validationTag, 'Confirmed in-game.');
    frag.appendChild(validationTag);
  }

  return frag;
}

function buildComparisonTag() {
  const tag = el('span', { className: 'formulas-status-tag formulas-cot2-tag', textContent: 'Changed from COT2' });
  attachTooltip(tag, 'This formula or table changed since Closed Online Test 2. See the comparison note below for details.');
  return tag;
}

function buildComparisonNotes(notes) {
  const wrap = el('div', { className: 'formulas-cot2-notes' });
  wrap.appendChild(el('strong', { className: 'formulas-cot2-heading', textContent: 'Comparison with COT2' }));
  notes.forEach(note => wrap.appendChild(el('div', { className: 'formulas-note', textContent: note })));
  return wrap;
}

function buildPipeline(steps, chapterStarts = {}) {
  const frag = document.createDocumentFragment();
  steps.forEach(({ label, wip, status, statusNote, validated, lines, notes, warnings, simple, cot2 }, i) => {
    if (chapterStarts[i]) {
      const { key, label: chapterLabel, description } = chapterStarts[i];
      const chapter = el('div', { className: 'formulas-stage-heading' });
      chapter.dataset.formulaSectionId = key;
      chapter.id = `formula-${key}`;
      chapter.appendChild(el('h2', { textContent: chapterLabel }));
      if (description) chapter.appendChild(el('p', { textContent: description }));
      frag.appendChild(chapter);
    }
    const step = el('div', { className: 'formulas-pipeline-step' });

    const stepHeader = el('div', { className: 'formulas-pipeline-header' });
    stepHeader.appendChild(el('span', { className: 'formulas-pipeline-badge', textContent: i + 1 }));
    const titleEl = el('span', { className: 'formulas-pipeline-title', textContent: label });
    stepHeader.appendChild(titleEl);
    if (wip) stepHeader.appendChild(el('span', { className: 'formulas-wip-tag', textContent: 'WIP' }));
    if (status) stepHeader.appendChild(makeStatusTag(status, statusNote, validated));
    if (cot2) stepHeader.appendChild(buildComparisonTag());
    step.appendChild(stepHeader);

    // A step may carry a `simple` variant: the common-case formula with the rare
    // branches (Prone Stab, meleeing with a ranged weapon) folded away. It is on by
    // default, because those branches make the general form hard to read for the
    // 99% case. The toggle switches to the exact form the client implements.
    const body = el('div', { className: 'formulas-pipeline-body' });
    let showSimple = Boolean(simple);

    const renderBody = () => {
      body.textContent = '';
      const useLines = showSimple ? simple.lines : lines;
      const useNotes = showSimple ? (simple.notes ?? notes) : notes;

      if (useLines.filter(l => l !== '').length) {
        const pre = el('pre', { className: 'formulas-code' });
        pre.innerHTML = useLines.map(l => l === '' ? '' : tokenizeLine(l)).join('\n');
        body.appendChild(pre);
      }

      // Warnings sit above the ordinary notes: they exist for traps a reader will
      // otherwise walk into, like reading Magic as the gear-only Magic Attack.
      if (warnings?.length) {
        const warnWrap = el('div', { className: 'formulas-warn-notes' });
        warnings.forEach(w => warnWrap.appendChild(el('div', { className: 'formulas-note', textContent: w })));
        body.appendChild(warnWrap);
      }

      if (useNotes?.length) {
        const noteWrap = el('div', { className: 'formulas-pipeline-notes' });
        useNotes.forEach(n => noteWrap.appendChild(el('div', { className: 'formulas-note', textContent: n })));
        body.appendChild(noteWrap);
      }
      if (cot2?.notes?.length) body.appendChild(buildComparisonNotes(cot2.notes));
    };

    if (simple) {
      const box = el('input', { type: 'checkbox' });
      box.checked = !showSimple;
      box.addEventListener('change', () => {
        showSimple = !box.checked;
        renderBody();
      });

      const toggle = el('label', { className: 'formulas-advanced-toggle' },
        box,
        el('span', { textContent: 'Advanced' }),
      );
      attachTooltip(toggle, 'Off: shows the standard formula for normal attacks. On: includes the edge-case branches for Prone Stab and meleeing with a Bow, Crossbow, or Claw.');
      // Sits directly after the step title, ahead of the status tags. Built here rather
      // than inline above because it needs renderBody() to exist. The class stops the
      // title's flex:1 from growing and pushing the toggle to the far edge - the toggle
      // takes over as the spacer instead, so the status tags stay right-aligned.
      stepHeader.classList.add('has-toggle');
      stepHeader.insertBefore(toggle, titleEl.nextSibling);
    }

    renderBody();
    step.appendChild(body);

    if (label === 'Shield Guard') step.appendChild(buildShieldGraph(GRAPH_ITEMS, GRAPH_DATA));
    if (label === 'Physical Damage') step.appendChild(buildDamageGraph(false, GRAPH_DATA, 0.7));
    if (label === 'Magical Damage') step.appendChild(buildDamageGraph(true, GRAPH_DATA, 0.7, 125));
    const explorer = buildFormulaExplorer(label, { monsters: CALC_MONSTERS });
    if (explorer) step.appendChild(explorer);
    if (label === 'Monster Accuracy' && CALC_MONSTERS.length) step.appendChild(buildMonsterHitCalc(CALC_MONSTERS));

    frag.appendChild(step);
  });
  return frag;
}

// ─── Section builders ─────────────────────────────────────────

const EXP_RULES = [
  ['Level 1 to 5', 'Exp = (floor(Level² / 2) + 15) × Level'],
  ['Level 6 to 50', 'Exp = (floor(Level² / 3) + 19) × floor(Level² / 3)'],
  ['Level 51 to 89', 'Exp = trunc(PreviousLevelExp × 1.0548)'],
  ['Level 90 to 99', 'Exp = trunc(PreviousLevelExp × 2.1)'],
];

// Cumulative exp, aligned with EXP_TABLE - EXP_CUMULATIVE[i] is the exp already
// spent on reaching the level EXP_TABLE[i] starts from.
const EXP_CUMULATIVE = (() => {
  let acc = 0;
  return EXP_TABLE.map(([, , exp]) => { const before = acc; acc += exp; return before; });
})();

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function compactExp(v) {
  if (v >= 1e9) return `${+(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`;
  if (v >= 1e6) return `${+(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `${+(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
  return `${v}`;
}

const EXP_SERIES = {
  level: {
    label: 'Per Level',
    title: 'Exp to Level Up',
    values: EXP_TABLE.map(([, , exp]) => exp),
    decades: [1, 10], // 10 .. 10B
  },
  cumulative: {
    label: 'Cumulative',
    title: 'Total Exp to Reach Level',
    values: EXP_TABLE.map(([, , exp], i) => EXP_CUMULATIVE[i] + exp),
    decades: [1, 11], // 10 .. 100B
  },
};

// Single-series line chart of the exp curve. The y axis is log: the curve spans six
// orders of magnitude, so a linear axis would flatten everything below level 90 onto
// the baseline. Hovering snaps to the nearest level and reports its exact numbers.
function buildExpChart() {
  const W = 520, H = 380;
  const M = { t: 14, r: 14, b: 32, l: 54 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  const levels = EXP_TABLE.map(([from]) => from);
  const lastLevel = levels[levels.length - 1];

  const wrap = el('div', { className: 'formulas-chart-wrap' });

  const head = el('div', { className: 'formulas-chart-head' });
  const title = el('span', { className: 'formulas-chart-title', textContent: EXP_SERIES.level.title });
  head.appendChild(title);
  const scaleToggle = el('div', { className: 'formulas-chart-scale' });
  head.appendChild(scaleToggle);
  wrap.appendChild(head);

  const plot = el('div', { className: 'formulas-chart-plot' });
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'formulas-chart-svg', role: 'img' });
  plot.appendChild(svg);
  const tip = el('div', { className: 'formulas-chart-tip' });
  plot.appendChild(tip);
  wrap.appendChild(plot);

  const xOf = lvl => M.l + ((lvl - 1) / (lastLevel - 1)) * plotW;

  let mode = 'level';

  function draw() {
    svg.replaceChildren();

    const series = EXP_SERIES[mode];
    const values = series.values;
    const [lo, hi] = series.decades;
    const yOf = v => M.t + plotH - ((Math.log10(v) - lo) / (hi - lo)) * plotH;
    title.textContent = series.title;

    const grid = svgEl('g', { class: 'formulas-chart-grid' });
    for (let d = lo; d <= hi; d++) {
      const t = 10 ** d;
      const y = yOf(t);
      grid.appendChild(svgEl('line', { x1: M.l, x2: M.l + plotW, y1: y, y2: y }));
      const label = svgEl('text', { x: M.l - 8, y: y + 3.5, class: 'formulas-chart-axis-label', 'text-anchor': 'end' });
      label.textContent = compactExp(t);
      grid.appendChild(label);
    }
    [1, 20, 40, 60, 80, 99].forEach(lvl => {
      const label = svgEl('text', { x: xOf(lvl), y: M.t + plotH + 20, class: 'formulas-chart-axis-label', 'text-anchor': 'middle' });
      label.textContent = lvl;
      grid.appendChild(label);
    });
    svg.appendChild(grid);

    const pts = levels.map((lvl, i) => [xOf(lvl), yOf(values[i])]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    svg.appendChild(svgEl('path', {
      class: 'formulas-chart-area',
      d: `${line} L${pts[pts.length - 1][0].toFixed(2)} ${M.t + plotH} L${pts[0][0].toFixed(2)} ${M.t + plotH} Z`,
    }));
    svg.appendChild(svgEl('path', { class: 'formulas-chart-line', d: line }));

    const focus = svgEl('g', { class: 'formulas-chart-focus' });
    const crosshair = svgEl('line', { y1: M.t, y2: M.t + plotH });
    const dot = svgEl('circle', { r: 4.5 });
    focus.appendChild(crosshair);
    focus.appendChild(dot);
    svg.appendChild(focus);

    const hit = svgEl('rect', { x: M.l, y: M.t, width: plotW, height: plotH, class: 'formulas-chart-hit' });
    svg.appendChild(hit);

    function moveTo(clientX) {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      const vx = (clientX - rect.left) / scale;
      const i = Math.max(0, Math.min(levels.length - 1,
        Math.round(((vx - M.l) / plotW) * (lastLevel - 1))));

      const [x, y] = pts[i];
      crosshair.setAttribute('x1', x);
      crosshair.setAttribute('x2', x);
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      focus.classList.add('visible');

      const perLevel = EXP_SERIES.level.values[i];
      const total = EXP_SERIES.cumulative.values[i];
      tip.innerHTML = '';
      tip.appendChild(el('div', { className: 'formulas-chart-tip-lvl', textContent: `Lv ${levels[i]} → ${levels[i] + 1}` }));
      tip.appendChild(el('div', {
        className: 'formulas-chart-tip-val',
        textContent: mode === 'level' ? `${perLevel.toLocaleString()} exp` : `${total.toLocaleString()} exp total`,
      }));
      tip.appendChild(el('div', {
        className: 'formulas-chart-tip-sub',
        textContent: mode === 'level'
          ? `${total.toLocaleString()} total to Lv ${levels[i] + 1}`
          : `${perLevel.toLocaleString()} for this level`,
      }));
      tip.classList.add('visible');
      tip.style.left = `${Math.min(Math.max(x * scale, 60), rect.width - 60)}px`;
      tip.style.top = `${y * scale}px`;
    }

    hit.addEventListener('pointermove', e => moveTo(e.clientX));
    hit.addEventListener('pointerleave', () => {
      focus.classList.remove('visible');
      tip.classList.remove('visible');
    });
  }

  Object.entries(EXP_SERIES).forEach(([key, { label }]) => {
    const btn = el('button', { className: `pill pill--sub${key === mode ? ' active' : ''}`, textContent: label });
    btn.addEventListener('click', () => {
      mode = key;
      scaleToggle.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b === btn));
      tip.classList.remove('visible');
      draw();
    });
    scaleToggle.appendChild(btn);
  });

  draw();
  return wrap;
}

function buildExpTable() {
  const container = el('div');

  const formulaWrap = el('div', { className: 'formulas-formula-wrap' });
  const block = el('div', { className: 'formulas-code-block' });
  EXP_RULES.forEach(([label, line]) => {
    const cell = el('div', { className: 'formulas-code-cell' });
    cell.appendChild(el('div', { className: 'formulas-code-label', textContent: label }));
    const pre = el('pre', { className: 'formulas-code' });
    pre.innerHTML = tokenizeLine(line);
    cell.appendChild(pre);
    block.appendChild(cell);
  });
  formulaWrap.appendChild(block);
  container.appendChild(formulaWrap);

  const split = el('div', { className: 'formulas-exp-split' });
  const tableWrap = el('div', { className: 'formulas-table-wrap formulas-exp-tablewrap' });
  const table = el('table', { className: 'data-table' });

  const thead = el('thead');
  const headerRow = el('tr');
  for (const [text, cls] of [['Level', ''], ['Exp to Level Up', 'num'], ['Accumulated Exp', 'num']]) {
    headerRow.appendChild(el('th', { className: `${cls} formulas-exp-th`.trim(), textContent: text }));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  let accumulated = 0;
  EXP_TABLE.forEach(([from, , exp]) => {
    const row = el('tr', { className: 'formulas-exp-row' });

    const lvlCell = el('td', { className: 'formulas-exp-td' });
    lvlCell.appendChild(el('span', { className: 'lvl-chip', textContent: `Lv ${from}` }));
    row.appendChild(lvlCell);

    row.appendChild(el('td', { className: 'num formulas-exp-val formulas-exp-td', textContent: exp.toLocaleString() }));
    row.appendChild(el('td', { className: 'num formulas-accum-val formulas-exp-td', textContent: accumulated.toLocaleString() }));

    tbody.appendChild(row);
    accumulated += exp;
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  split.appendChild(tableWrap);
  split.appendChild(buildExpChart());
  container.appendChild(split);
  return container;
}

function buildCitizenshipTable() {
  const container = el('div');

  const tableWrap = el('div', { className: 'formulas-table-wrap hitviz-scroll-table' });
  const table = el('table', { className: 'data-table' });

  // Same text treatment as the Experience Table: chip in the key column, the
  // headline number in accent, the supporting number dimmed.
  const thead = el('thead');
  const headerRow = el('tr');
  for (const [text, cls] of [['Grade', ''], ['Contribution Required', 'num'], ['Character Level Required', 'num']]) {
    headerRow.appendChild(el('th', { className: `${cls} formulas-exp-th`.trim(), textContent: text }));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  CITIZENSHIP_GRADES.forEach(([grade, contribution, level, name]) => {
    const row = el('tr', { className: 'formulas-exp-row' });

    const gradeCell = el('td', { className: 'formulas-exp-td' });
    gradeCell.appendChild(el('span', { className: 'lvl-chip', textContent: `Grade ${grade}` }));
    gradeCell.appendChild(el('span', { className: 'formulas-grade-name', textContent: name }));
    row.appendChild(gradeCell);

    row.appendChild(el('td', {
      className: 'num formulas-exp-val formulas-exp-td',
      textContent: contribution.toLocaleString(),
    }));
    row.appendChild(el('td', {
      className: 'num formulas-accum-val formulas-exp-td',
      textContent: `Lv ${level}`,
    }));
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  container.appendChild(tableWrap);

  container.appendChild(el('div', {
    className: 'formulas-note formulas-note--padded',
    textContent: 'Each figure buys one grade (counter resets on grade-up). Grade 1 comes from the citizenship quest; the full climb costs 45,000 contribution.',
  }));

  return container;
}

function buildCraftTable() {
  const container = el('div');

  const formulaWrap = el('div', { className: 'formulas-formula-wrap' });
  const block = el('div', { className: 'formulas-code-block' });
  CRAFT_RULES.forEach(([label, line]) => {
    const cell = el('div', { className: 'formulas-code-cell' });
    cell.appendChild(el('div', { className: 'formulas-code-label', textContent: label }));
    const pre = el('pre', { className: 'formulas-code' });
    pre.innerHTML = tokenizeLine(line);
    cell.appendChild(pre);
    block.appendChild(cell);
  });
  formulaWrap.appendChild(block);
  container.appendChild(formulaWrap);

  const tableWrap = el('div', { className: 'formulas-table-wrap' });
  const table = el('table', { className: 'data-table' });

  const thead = el('thead');
  const headerRow = el('tr');
  for (const [text, cls] of [['Craft Level', ''], ['Craft Exp to Level Up', 'num'], ['Accumulated Craft Exp', 'num'], ['Character Level Required', 'num']]) {
    headerRow.appendChild(el('th', { className: `${cls} formulas-exp-th`.trim(), textContent: text }));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  let accumulated = 0;
  CRAFT_LEVELS.forEach(([level, exp, charLevel]) => {
    const row = el('tr', { className: 'formulas-exp-row' });

    const lvlCell = el('td', { className: 'formulas-exp-td' });
    lvlCell.appendChild(el('span', { className: 'lvl-chip', textContent: `Lv ${level}` }));
    row.appendChild(lvlCell);

    row.appendChild(el('td', { className: 'num formulas-exp-val formulas-exp-td', textContent: exp.toLocaleString() }));
    row.appendChild(el('td', { className: 'num formulas-accum-val formulas-exp-td', textContent: accumulated.toLocaleString() }));
    row.appendChild(el('td', {
      className: 'num formulas-accum-val formulas-exp-td',
      textContent: charLevel === null ? '-' : `Lv ${charLevel}`,
    }));

    tbody.appendChild(row);
    accumulated += exp;
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  container.appendChild(tableWrap);

  return container;
}

function buildHitDetectionOverview() {
  const container = el('div', { className: 'formulas-formula-wrap' });

  const block = el('div', { className: 'formulas-code-block' });
  [
    ['The two hitboxes', 'Attack hitbox = the invisible shape that searches for monsters\nMonster hitbox = the invisible box where a monster can be targeted'],
    ['The short version', 'Overlap makes a monster eligible.\nThe game applies target priority and the skill\'s target cap. Basic ranged attacks and projectile skills then remove targets blocked by terrain.'],
  ].forEach(([label, line]) => {
    const cell = el('div', { className: 'formulas-code-cell' });
    cell.appendChild(el('div', { className: 'formulas-code-label', textContent: label }));
    cell.appendChild(el('pre', { className: 'formulas-code', textContent: line }));
    block.appendChild(cell);
  });
  container.appendChild(block);

  const tableWrap = el('div', { className: 'formulas-table-wrap hitviz-scroll-table' });
  tableWrap.appendChild(el('div', { className: 'formulas-subhead', textContent: 'What happens when you attack' }));
  tableWrap.appendChild(buildTable(
    [['Step', 'num'], ['Game check', ''], ['What the game does', '']],
    [
      ['1', 'Build the attack hitbox', 'The game places an invisible box, line, or widening cone from the point at your character\'s feet. Facing the other way flips directional hitboxes.'],
      ['2', 'Find eligible monsters', 'A monster becomes eligible when its hitbox overlaps the attack hitbox. Edge-only contact and visible artwork do not count.'],
      ['3', 'Apply priority and target cap', 'The game orders eligible monsters, then fills the skill\'s target cap. The hard maximum is 15 targets.'],
      ['4', 'Check blocking terrain', 'Basic ranged attacks and projectile skills remove blocked targets without filling the empty slots. Other attacks skip this check.'],
      ['5', 'Play the attack', 'Damage lines, projectiles, and effects use the finished target list. They do not search for replacements.'],
    ],
  ));
  container.appendChild(tableWrap);
  container.appendChild(el('div', {
    className: 'formulas-note formulas-note--padded',
    textContent: 'The foot marker in each diagram is the player origin used to position hitboxes. Your visible hands, weapon, projectile, and skill effects do not change those hidden shapes.',
  }));
  return container;
}

const HITVIZ_CHARACTER = 'images/hair/00030000.png';
const HITVIZ_STUMP = 'assets/hitviz/stump.png';
const HITVIZ_TERRAIN = {
  ground: 'assets/hitviz/grassy-soil-edge.png',
  soil: 'assets/hitviz/grassy-soil-fill.png',
  wall: 'assets/hitviz/grassy-soil-wall.png',
};
// The Beauty compositor renders this stand1 composite at 3x. Before scaling its
// cropped bounds are 39x66, and the body-frame WZ origin lands at (23, 66)
// inside that crop. Keep those logical dimensions here so the sprite shares the
// diagrams' game-pixel coordinate scale.
const HITVIZ_CHARACTER_BOUNDS = { width: 39, height: 66, originX: 23, originY: 66 };
// Stump move/0 is a 62x51 frame with its WZ origin at the bottom centre.
const HITVIZ_STUMP_BOUNDS = { width: 62, height: 51, originX: 31, originY: 51 };

// These are the same grassySoil sprites and origin rules used by map_compositor.py.
// The horizontal edge's foothold sits 13 px below the top of the 38 px sprite;
// the soil tile begins at its 38 px image edge, exactly as it does in a map layer.
function addHitvizGround(svg, x1, x2, groundY) {
  const width = Math.max(0, x2 - x1);
  if (!width) return;
  const terrain = svgEl('svg', {
    x: x1,
    y: groundY - 13,
    width,
    height: 98,
    viewBox: `0 0 ${width} 98`,
    class: 'hitviz-terrain-crop',
    overflow: 'hidden',
    'aria-hidden': 'true',
  });
  for (let x = 0; x < width; x += 90) {
    terrain.appendChild(svgEl('image', {
      href: HITVIZ_TERRAIN.ground,
      x,
      y: 0,
      width: 90,
      height: 38,
      class: 'hitviz-terrain-sprite',
    }));
    terrain.appendChild(svgEl('image', {
      href: HITVIZ_TERRAIN.soil,
      x,
      y: 38,
      width: 90,
      height: 60,
      class: 'hitviz-terrain-sprite',
    }));
  }
  svg.appendChild(terrain);
}

function addHitvizWall(svg, x, topY, bottomY) {
  const height = Math.max(0, bottomY - topY);
  if (!height) return;
  const terrain = svgEl('svg', {
    x: x - 16,
    y: topY,
    width: 32,
    height,
    viewBox: `0 0 32 ${height}`,
    class: 'hitviz-terrain-crop',
    overflow: 'hidden',
    'aria-hidden': 'true',
  });
  for (let y = 0; y < height; y += 60) {
    terrain.appendChild(svgEl('image', {
      href: HITVIZ_TERRAIN.wall,
      x: 0,
      y,
      width: 32,
      height: 60,
      class: 'hitviz-terrain-sprite',
    }));
  }
  svg.appendChild(terrain);
  // Keep the collision edge visible as a debug overlay on the rendered terrain.
  svg.appendChild(svgEl('line', { x1: x, y1: topY, x2: x, y2: bottomY, class: 'hitviz-blocker' }));
}

function addHitvizPlatform(svg, x1, x2, platformY) {
  const width = Math.max(0, x2 - x1);
  if (!width) return;
  const terrain = svgEl('svg', {
    x: x1,
    y: platformY - 13,
    width,
    height: 32,
    viewBox: `0 0 ${width} 32`,
    class: 'hitviz-terrain-crop',
    overflow: 'hidden',
    'aria-hidden': 'true',
  });
  for (let x = 0; x < width; x += 90) {
    terrain.appendChild(svgEl('image', {
      href: HITVIZ_TERRAIN.ground,
      x,
      y: 0,
      width: 90,
      height: 38,
      class: 'hitviz-terrain-sprite',
    }));
  }
  svg.appendChild(terrain);
  svg.appendChild(svgEl('line', {
    x1,
    y1: platformY,
    x2,
    y2: platformY,
    class: 'hitviz-blocker',
  }));
}

function addHitvizGrid(svg, id, width, height) {
  const defs = svgEl('defs');
  const pattern = svgEl('pattern', {
    id, width: 20, height: 20, patternUnits: 'userSpaceOnUse',
  });
  pattern.appendChild(svgEl('path', {
    d: 'M 20 0 L 0 0 0 20', class: 'hitviz-grid-line',
  }));
  defs.appendChild(pattern);
  svg.appendChild(defs);
  svg.appendChild(svgEl('rect', {
    x: 0, y: 0, width, height, fill: `url(#${id})`, class: 'hitviz-grid-fill',
  }));
}

function addHitvizText(svg, textContent, x, y, className = '') {
  const textNode = svgEl('text', { x, y, class: `hitviz-svg-text${className ? ` ${className}` : ''}` });
  textNode.textContent = textContent;
  svg.appendChild(textNode);
  return textNode;
}

function addHitvizRangedCorridor(svg, originX, originY, nearX, farX) {
  const nearHalfHeight = 20 + Math.trunc(Math.abs(nearX - originX) / 4);
  const farHalfHeight = 20 + Math.trunc(Math.abs(farX - originX) / 4);
  svg.appendChild(svgEl('polygon', {
    points: [
      `${nearX},${originY - nearHalfHeight}`,
      `${farX},${originY - farHalfHeight}`,
      `${farX},${originY + farHalfHeight}`,
      `${nearX},${originY + nearHalfHeight}`,
    ].join(' '),
    class: 'hitviz-hitbox',
  }));
}

function addHitvizDimension(svg, x1, y1, x2, y2, label, labelX, labelY) {
  svg.appendChild(svgEl('line', { x1, y1, x2, y2, class: 'hitviz-dimension' }));
  if (y1 === y2) {
    svg.appendChild(svgEl('line', { x1, y1: y1 - 4, x2: x1, y2: y1 + 4, class: 'hitviz-dimension' }));
    svg.appendChild(svgEl('line', { x1: x2, y1: y2 - 4, x2, y2: y2 + 4, class: 'hitviz-dimension' }));
  } else {
    svg.appendChild(svgEl('line', { x1: x1 - 4, y1, x2: x1 + 4, y2: y1, class: 'hitviz-dimension' }));
    svg.appendChild(svgEl('line', { x1: x2 - 4, y1: y2, x2: x2 + 4, y2, class: 'hitviz-dimension' }));
  }
  addHitvizText(svg, label, labelX, labelY, 'hitviz-svg-text--dimension');
}

function addHitvizCharacter(svg, originX, originY, facingRight = true) {
  const bounds = HITVIZ_CHARACTER_BOUNDS;
  svg.appendChild(svgEl('image', {
    href: normalizeAssetPath(HITVIZ_CHARACTER),
    x: originX - bounds.originX,
    y: originY - bounds.originY,
    width: bounds.width,
    height: bounds.height,
    // The saved stand frame faces left. Mirror it only when the target is rightward.
    transform: facingRight ? `translate(${2 * originX} 0) scale(-1 1)` : '',
    class: 'hitviz-sprite',
    preserveAspectRatio: 'xMidYMax meet',
  }));
  svg.appendChild(svgEl('line', {
    x1: originX - 7, y1: originY, x2: originX + 7, y2: originY, class: 'hitviz-origin',
  }));
  svg.appendChild(svgEl('line', {
    x1: originX, y1: originY - 7, x2: originX, y2: originY + 7, class: 'hitviz-origin',
  }));
  svg.appendChild(svgEl('circle', {
    cx: originX, cy: originY, r: 2.5, class: 'hitviz-origin-dot',
  }));
}

function buildHitvizLegend(legend) {
  const legendEl = el('div', { className: 'hitviz-legend', role: 'list', 'aria-label': 'Diagram key' });
  legend.forEach(([style, label]) => {
    const item = el('span', { className: 'hitviz-legend-item', role: 'listitem' });
    item.appendChild(el('span', {
      className: `hitviz-legend-swatch hitviz-legend-swatch--${style}`,
      'aria-hidden': 'true',
    }));
    item.append(label);
    legendEl.appendChild(item);
  });
  return legendEl;
}

function buildHitvizCard(title, eyebrow, svg, caption, legend = []) {
  const card = el('figure', { className: 'hitviz-card' });
  const head = el('figcaption', { className: 'hitviz-head' });
  const titleWrap = el('div');
  titleWrap.appendChild(el('div', { className: 'hitviz-eyebrow', textContent: eyebrow }));
  titleWrap.appendChild(el('div', { className: 'hitviz-title', textContent: title }));
  head.appendChild(titleWrap);
  card.appendChild(head);
  card.appendChild(el('div', {
    className: 'hitviz-scroll-hint',
    textContent: 'Swipe diagram →',
  }));
  card.appendChild(el('div', { className: 'hitviz-stage' }, svg));
  if (legend.length) card.appendChild(buildHitvizLegend(legend));
  card.appendChild(el('p', { className: 'hitviz-caption', textContent: caption }));
  return card;
}

function addHitvizMob(svg, x, y, width = 42, height = 58, label = '') {
  const bounds = HITVIZ_STUMP_BOUNDS;
  const originX = x + width / 2;
  const originY = y + height;
  const collisionX = originX - bounds.originX;
  const collisionY = originY - bounds.originY;
  svg.appendChild(svgEl('image', {
    href: HITVIZ_STUMP,
    x: collisionX,
    y: collisionY,
    width: bounds.width,
    height: bounds.height,
    class: 'hitviz-sprite hitviz-mob-sprite',
    preserveAspectRatio: 'xMidYMax meet',
    'aria-hidden': 'true',
  }));
  svg.appendChild(svgEl('rect', {
    x: collisionX,
    y: collisionY,
    width: bounds.width,
    height: bounds.height,
    class: 'hitviz-mob-box',
  }));
  if (label) addHitvizText(svg, label, originX, collisionY - 7, 'hitviz-svg-text--muted');
}

function buildAttackTypeVisual(title, examples, id, ariaLabel, draw, caption, legend = [], options = {}) {
  const width = 320;
  const height = options.height ?? 180;
  const groundY = options.groundY ?? 145;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'hitviz-svg hitviz-svg--mini',
    role: 'img',
    'aria-label': ariaLabel,
    preserveAspectRatio: 'xMidYMid meet',
  });
  addHitvizGrid(svg, `hitviz-grid-${id}`, width, height);
  draw(svg, { width, height, groundY });

  const card = buildHitvizCard(title, 'Attack type', svg, caption, legend);
  card.classList.add('hitviz-card--mini');
  const examplesNode = el('div', { className: 'hitviz-examples' });
  examplesNode.appendChild(el('span', {
    className: 'hitviz-examples-label', textContent: 'Examples',
  }));
  examplesNode.appendChild(el('span', {
    className: 'hitviz-examples-list', textContent: examples,
  }));
  card.insertBefore(examplesNode, card.querySelector('.hitviz-stage'));
  const captionNode = card.querySelector('.hitviz-caption');
  captionNode.textContent = '';
  captionNode.appendChild(el('span', {
    className: 'hitviz-caption-label', textContent: 'Where the game checks',
  }));
  captionNode.append(caption);
  return card;
}

function buildAttackTypeVisuals(keys = null) {
  const grid = el('div', { className: 'hitviz-type-grid' });
  const cards = new Map();
  const addCard = (key, card) => cards.set(key, card);

  addCard('animation-melee', buildAttackTypeVisual(
    'Melee',
    'Normal melee attacks, Power Strike',
    'type-animation-melee',
    'A weapon swing hitbox overlapping a monster',
    (svg, { width, groundY }) => {
      const originX = 64;
      addHitvizGround(svg, 0, width, groundY);
      svg.appendChild(svgEl('rect', { x: 78, y: 82, width: 82, height: 57, class: 'hitviz-hitbox' }));
      addHitvizMob(svg, 136, 78, 42, 67);
      svg.appendChild(svgEl('rect', { x: 136, y: 82, width: 24, height: 57, class: 'hitviz-overlap' }));
      addHitvizCharacter(svg, originX, groundY);
      addHitvizText(svg, 'current swing hitbox', 119, 58, 'hitviz-svg-text--hitbox');
      addHitvizText(svg, 'overlap = target', 191, 119, 'hitviz-svg-text--effect');
    },
    'The current weapon swing supplies the attack hitbox, so the hitbox can change with the swing animation.',
    [
      ['primary', 'Swing hitbox'],
      ['monster', 'Monster hitbox'],
      ['overlap', 'Overlap selects target'],
    ],
  ));

  addCard('triggered-splash', buildAttackTypeVisual(
    'Conditional extra range',
    'Slash Blast',
    'type-triggered-splash',
    'Slash Blast keeping the swing height and extending only its forward edge to the measured 130 or 150 pixel range',
    (svg, { width, groundY }) => {
      const originX = 48;
      const originalLeft = 61;
      const originalTop = 88;
      const originalRight = 137;
      const originalBottom = 139;
      const level10Edge = originX + 130;
      const maxEdge = originX + 150;
      addHitvizGround(svg, 0, width, groundY);
      svg.appendChild(svgEl('rect', {
        x: originalLeft,
        y: originalTop,
        width: maxEdge - originalLeft,
        height: originalBottom - originalTop,
        class: 'hitviz-hitbox hitviz-hitbox--secondary',
      }));
      svg.appendChild(svgEl('line', {
        x1: level10Edge,
        y1: originalTop,
        x2: level10Edge,
        y2: originalBottom,
        class: 'hitviz-dimension',
      }));
      svg.appendChild(svgEl('rect', {
        x: originalLeft,
        y: originalTop,
        width: originalRight - originalLeft,
        height: originalBottom - originalTop,
        class: 'hitviz-hitbox',
      }));
      addHitvizMob(svg, 105, 83, 38, 62, 'trigger');
      svg.appendChild(svgEl('rect', {
        x: 179,
        y: 94,
        width: maxEdge - 179,
        height: originalBottom - 94,
        class: 'hitviz-overlap',
      }));
      addHitvizCharacter(svg, originX, groundY);
      addHitvizDimension(svg, originX, 73, maxEdge, 73, '150 px max', 123, 67);
      addHitvizText(svg, 'first swing hitbox', 99, 56, 'hitviz-svg-text--hitbox');
      addHitvizText(svg, 'extends forward only', 166, 42, 'hitviz-svg-text--secondary-area');
    },
    'If the first swing finds exactly one monster, Slash Blast keeps the same height and extends only the front edge: 130 px at Lv. 1-10 and 150 px at Lv. 11-20.',
    [
      ['primary', 'First target check'],
      ['secondary', 'Extra forward range after one hit'],
      ['monster', 'Monster hitbox'],
      ['overlap', 'Max-range overlap'],
    ],
  ));

  addCard('normal-ranged', buildAttackTypeVisual(
    'Basic ranged attacks',
    'Normal bow, crossbow, and throwing-star attacks',
    'type-normal-ranged',
    'A basic ranged attack selecting a monster whose hitbox crosses its horizontal target line',
    (svg, { width, groundY }) => {
      const originX = 40;
      const stripY = groundY - 28;
      const nearX = originX + 65;
      addHitvizGround(svg, 0, width, groundY);
      svg.appendChild(svgEl('rect', { x: nearX, y: stripY, width: 174, height: 1, class: 'hitviz-hitbox hitviz-hitbox--strip' }));
      addHitvizMob(svg, 235, 75, 42, 70);
      addHitvizCharacter(svg, originX, groundY);
      addHitvizText(svg, '1 px target line', 190, stripY - 8, 'hitviz-svg-text--hitbox');
    },
    'A basic ranged attack uses this one-pixel target line. It sits 28 px above your feet, starts 65 px in front of you, and ends at the attack\'s calculated range. A monster is eligible only when its hitbox crosses the line.',
    [
      ['target-line', 'One-pixel target line'],
      ['monster', 'Monster hitbox'],
    ],
  ));

  addCard('ranged-projectile', buildAttackTypeVisual(
    'Ranged projectile skills',
    'Arrow Blow, Energy Bolt',
    'type-ranged-projectile-skill',
    'A projectile skill selecting a monster anywhere inside a widening targeting cone',
    (svg, { width, groundY }) => {
      const originX = 40;
      const nearX = originX + 65;
      addHitvizGround(svg, 0, width, groundY);
      addHitvizRangedCorridor(svg, originX, groundY, nearX, 279);
      addHitvizMob(svg, 235, groundY - 70, 42, 70);
      addHitvizCharacter(svg, originX, groundY);
      addHitvizText(svg, 'widening target cone', 175, 28, 'hitviz-svg-text--hitbox');
    },
    'Most ranged skills use a hidden targeting cone that widens with distance. A monster becomes eligible when its hitbox overlaps the cone.',
    [
      ['primary', 'Widening target cone'],
      ['monster', 'Monster hitbox'],
    ],
    { height: 200, groundY: 115 },
  ));

  addCard('area-skills', buildAttackTypeVisual(
    'Area skills',
    'Shout, Dragon Roar, Arrow Rain, Savage Blow',
    'type-area-skills',
    'Centered and forward-facing rectangular area attacks shown side by side',
    (svg, { height }) => {
      const groundY = 145;
      addHitvizGround(svg, 0, 146, groundY);
      addHitvizGround(svg, 174, 320, groundY);
      svg.appendChild(svgEl('line', { x1: 160, y1: 16, x2: 160, y2: height - 12, class: 'hitviz-panel-divider' }));
      svg.appendChild(svgEl('rect', { x: 18, y: 66, width: 124, height: 73, class: 'hitviz-hitbox' }));
      svg.appendChild(svgEl('rect', { x: 221, y: 76, width: 79, height: 63, class: 'hitviz-hitbox' }));
      addHitvizCharacter(svg, 80, groundY);
      addHitvizCharacter(svg, 207, groundY);
      addHitvizMob(svg, 25, 80, 36, 65);
      addHitvizMob(svg, 105, 80, 36, 65);
      addHitvizMob(svg, 270, 80, 36, 65);
      addHitvizText(svg, 'centered', 80, 54, 'hitviz-svg-text--hitbox');
      addHitvizText(svg, 'directional', 260, 64, 'hitviz-svg-text--hitbox');
    },
    'Centered areas reach both sides of your character. Directional areas, such as Savage Blow, use a fixed box mostly in front of you and mirror it when you turn around.',
    [
      ['primary', 'Attack hitbox'],
      ['monster', 'Monster hitbox'],
    ],
  ));

  const selectedKeys = keys ?? [...cards.keys()];
  selectedKeys.forEach((key) => {
    const card = cards.get(key);
    if (card) grid.appendChild(card);
  });
  if (selectedKeys.length === 1) grid.classList.add('hitviz-type-grid--single');
  return grid;
}

function buildRangedTerrainComparisonVisual() {
  const comparison = el('div', { className: 'hitviz-comparison' });
  comparison.appendChild(el('div', {
    className: 'formulas-subhead',
    textContent: 'Ranged',
  }));

  const grid = el('div', { className: 'hitviz-type-grid hitviz-type-grid--comparison' });
  const buildPanel = (title, eyebrow, id, rayStartsAtLine) => {
    const width = 320;
    const height = 220;
    const groundY = 135;
    const stripY = groundY - 28;
    const originX = 48;
    const nearX = originX + 60;
    const targetX = 258;
    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`,
      class: 'hitviz-svg hitviz-svg--mini',
      role: 'img',
      'aria-label': rayStartsAtLine
        ? 'Normal ranged shot checking terrain horizontally from the one-pixel target line'
        : 'Projectile skill checking terrain diagonally from the player origin at the character\'s feet',
      preserveAspectRatio: 'xMidYMid meet',
    });
    addHitvizGrid(svg, id, width, height);
    addHitvizGround(svg, 0, width, groundY);
    if (rayStartsAtLine) {
      svg.appendChild(svgEl('rect', {
        x: nearX, y: stripY, width: targetX + 24 - nearX, height: 1, class: 'hitviz-hitbox hitviz-hitbox--strip',
      }));
    } else {
      addHitvizRangedCorridor(svg, originX, groundY, nearX, targetX + 24);
    }
    addHitvizMob(svg, targetX - 24, 88, 48, groundY - 88);
    const rayStartY = rayStartsAtLine ? stripY : groundY;
    addHitvizCharacter(svg, originX, groundY);
    svg.appendChild(svgEl('line', { x1: originX, y1: rayStartY, x2: targetX, y2: rayStartsAtLine ? stripY : 96, class: 'hitviz-los' }));
    svg.appendChild(svgEl('circle', { cx: originX, cy: rayStartY, r: 5, class: 'hitviz-ray-start' }));
    addHitvizText(svg, rayStartsAtLine ? 'target line' : 'widening target cone', 185, stripY - 10, 'hitviz-svg-text--hitbox');

    return buildHitvizCard(
      title,
      eyebrow,
      svg,
      rayStartsAtLine
        ? 'The game checks for blocking terrain from the one-pixel target line, straight across to the monster.'
        : 'The targeting cone finds an eligible monster first. The game then checks for blocking terrain from your feet to the closest edge of that monster\'s hitbox.',
      [
        [rayStartsAtLine ? 'target-line' : 'primary', rayStartsAtLine ? 'One-pixel target line' : 'Widening target cone'],
        ['ray-start', 'Start of terrain check'],
        ['check-line', 'Terrain check, not projectile'],
        ['monster', 'Monster hitbox'],
      ],
    );
  };

  grid.appendChild(buildPanel('Normal ranged shot', 'Terrain check starts on target line', 'hitviz-grid-normal-ray', true));
  grid.appendChild(buildPanel('Projectile skill with a targeting cone', 'Projectile terrain check', 'hitviz-grid-skill-ray', false));
  comparison.appendChild(grid);
  return comparison;
}

function buildObstructionVisual() {
  const width = 620;
  const height = 260;
  const originX = 90;
  const originY = 205;
  const targetX = 530;
  const targetY = 135;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'hitviz-svg',
    role: 'img',
    'aria-label': 'Diagram showing a wall or platform blocking a skill terrain check from the point at the character\'s feet',
    preserveAspectRatio: 'xMidYMid meet',
  });
  addHitvizGrid(svg, 'hitviz-grid-obstruction', width, height);
  addHitvizGround(svg, 0, 250, originY);
  addHitvizGround(svg, 458, width, targetY + 34);
  addHitvizWall(svg, 318, 72, 222);
  svg.appendChild(svgEl('line', { x1: originX, y1: originY, x2: targetX, y2: targetY, class: 'hitviz-los' }));
  addHitvizMob(svg, targetX - 28, targetY - 34, 56, 68);
  addHitvizCharacter(svg, originX, originY);
  const t = (318 - originX) / (targetX - originX);
  const hitY = originY + t * (targetY - originY);
  svg.appendChild(svgEl('circle', { cx: 318, cy: hitY, r: 6, class: 'hitviz-blocked-point' }));
  addHitvizText(svg, 'blocking terrain', 326, 62, 'hitviz-svg-text--blocker');
  addHitvizText(svg, 'point at your feet', originX + 12, originY + 18, 'hitviz-svg-text--muted');
  addHitvizText(svg, 'point checked near target', targetX, targetY - 43, 'hitviz-svg-text--muted');
  addHitvizText(svg, 'target blocked', 326, hitY + 21, 'hitviz-svg-text--blocker');
  return buildHitvizCard(
    'Target blocked by a wall',
    'Horizontal terrain check',
    svg,
    'For attacks that check terrain, the game draws an invisible line from your feet toward the monster. If that line runs into the blocking side of a wall, the monster is dropped from the attack.',
    [
      ['check-line', 'Line checked for terrain'],
      ['terrain', 'Blocking terrain'],
      ['monster', 'Monster hitbox'],
      ['blocked', 'Blocked point'],
    ],
  );
}

function buildDownwardPlatformObstructionVisual() {
  const width = 620;
  const height = 280;
  const originX = 135;
  const originY = 115;
  const platformX1 = 55;
  const platformX2 = 240;
  const targetX = 435;
  const targetY = 145;
  const targetGroundY = 195;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'hitviz-svg',
    role: 'img',
    'aria-label': 'Diagram showing Lucky Seven crossing downward through the platform beneath the character and blocking the target',
    preserveAspectRatio: 'xMidYMid meet',
  });
  addHitvizGrid(svg, 'hitviz-grid-platform-down', width, height);
  addHitvizPlatform(svg, platformX1, platformX2, originY);
  addHitvizGround(svg, 380, 530, targetGroundY);
  svg.appendChild(svgEl('rect', { x: 370, y: 120, width: 130, height: 75, class: 'hitviz-hitbox' }));
  svg.appendChild(svgEl('line', { x1: originX, y1: originY, x2: targetX, y2: targetY, class: 'hitviz-los' }));
  addHitvizMob(svg, targetX - 28, targetGroundY - 68, 56, 68);
  addHitvizCharacter(svg, originX, originY);

  svg.appendChild(svgEl('circle', { cx: originX, cy: originY, r: 8, class: 'hitviz-blocked-point hitviz-blocked-point--fatal' }));
  addHitvizText(svg, 'blocked immediately at your feet', originX + 15, originY + 28, 'hitviz-svg-text--blocked');
  addHitvizText(svg, 'attack hitbox reaches Stump', targetX, 113, 'hitviz-svg-text--hitbox');
  return buildHitvizCard(
    'Target blocked crossing downward',
    'Attacking from above',
    svg,
    'The character stands on the platform that is tested. The terrain line starts at their feet and immediately leaves the platform downward into its blocking side, so the game drops the Stump.',
    [
      ['primary', 'Attack hitbox'],
      ['check-line', 'Line checked for terrain'],
      ['monster', 'Stump hitbox'],
      ['blocked-fatal', 'Blocked at your feet'],
    ],
  );
}

function buildUpwardPlatformClearVisual() {
  const width = 620;
  const height = 280;
  const originX = 135;
  const originY = 195;
  const platformX1 = 55;
  const platformX2 = 240;
  const targetX = 435;
  const targetY = 110;
  const targetGroundY = 115;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'hitviz-svg',
    role: 'img',
    'aria-label': 'Diagram showing Lucky Seven leaving the platform beneath the character upward and keeping the target',
    preserveAspectRatio: 'xMidYMid meet',
  });
  addHitvizGrid(svg, 'hitviz-grid-platform-up', width, height);
  addHitvizPlatform(svg, platformX1, platformX2, originY);
  addHitvizGround(svg, 380, 530, targetGroundY);
  svg.appendChild(svgEl('rect', { x: 370, y: 40, width: 130, height: 75, class: 'hitviz-hitbox' }));
  svg.appendChild(svgEl('line', { x1: originX, y1: originY, x2: targetX, y2: targetY, class: 'hitviz-los' }));
  addHitvizMob(svg, targetX - 28, targetGroundY - 68, 56, 68);
  addHitvizCharacter(svg, originX, originY);

  const targetPlatformProgress = (targetGroundY - originY) / (targetY - originY);
  const targetPlatformHitX = originX + targetPlatformProgress * (targetX - originX);
  svg.appendChild(svgEl('circle', { cx: targetPlatformHitX, cy: targetGroundY, r: 6, class: 'hitviz-clear-point' }));
  addHitvizText(svg, 'crosses upward: clear', 315, 145, 'hitviz-svg-text--clear');
  addHitvizText(svg, 'leaves own platform upward', originX + 18, originY - 18, 'hitviz-svg-text--muted');
  addHitvizText(svg, 'attack hitbox reaches Stump', targetX, 37, 'hitviz-svg-text--hitbox');
  return buildHitvizCard(
    'Target kept crossing upward',
    'Attacking from below',
    svg,
    'The character stands on the lower platform. The terrain line leaves that platform upward and crosses the Stump\'s platform from below to above. Both contacts move toward the open side, so the Stump stays eligible.',
    [
      ['primary', 'Attack hitbox'],
      ['check-line', 'Line checked for terrain'],
      ['monster', 'Stump hitbox'],
      ['clear', 'Clear crossing'],
    ],
  );
}

function buildAttackAreaGuide() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildAttackTypeVisuals([
    'animation-melee',
    'triggered-splash',
    'normal-ranged',
    'ranged-projectile',
    'area-skills',
  ]));
  container.appendChild(el('div', {
    className: 'formulas-note formulas-note--padded',
    textContent: 'Every attack starts with a hidden hitbox positioned from the player origin at your character\'s feet. Facing the other way flips directional hitboxes; artwork, visible weapon reach, and effect placement do not change them.',
  }));
  return container;
}

function buildCollisionOverlapVisual() {
  const width = 620;
  const height = 230;
  const groundY = 175;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'hitviz-svg',
    role: 'img',
    'aria-label': 'Comparison of positive collision overlap selecting a monster and edge-only contact missing it',
    preserveAspectRatio: 'xMidYMid meet',
  });
  addHitvizGrid(svg, 'hitviz-grid-collision-overlap', width, height);
  addHitvizGround(svg, 0, 286, groundY);
  addHitvizGround(svg, 334, width, groundY);
  svg.appendChild(svgEl('line', { x1: 310, y1: 18, x2: 310, y2: height - 14, class: 'hitviz-panel-divider' }));

  svg.appendChild(svgEl('rect', { x: 35, y: 98, width: 165, height: 67, class: 'hitviz-hitbox' }));
  addHitvizMob(svg, 170, 100, 42, 75);
  svg.appendChild(svgEl('rect', { x: 160, y: 124, width: 40, height: 41, class: 'hitviz-overlap' }));
  addHitvizText(svg, 'shared area', 135, 82, 'hitviz-svg-text--effect');
  addHitvizText(svg, 'can be targeted', 181, 192, 'hitviz-svg-text--hitbox');

  svg.appendChild(svgEl('rect', { x: 350, y: 98, width: 130, height: 67, class: 'hitviz-hitbox' }));
  addHitvizMob(svg, 490, 100, 42, 75);
  svg.appendChild(svgEl('line', { x1: 480, y1: 98, x2: 480, y2: 165, class: 'hitviz-dimension' }));
  addHitvizText(svg, 'edges only touch', 480, 82, 'hitviz-svg-text--muted');
  addHitvizText(svg, 'not selected', 500, 192, 'hitviz-svg-text--muted');

  return buildHitvizCard(
    'Shared area lets a monster be targeted',
    'Step 2 · hidden hitboxes',
    svg,
    'The attack and monster hitboxes must share some width and height. If their edges only touch, the monster is not eligible.',
    [
      ['primary', 'Attack hitbox'],
      ['monster', 'Monster hitbox'],
      ['overlap', 'Positive overlap'],
    ],
  );
}

function buildOverlapGuide() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildCollisionOverlapVisual());

  const tableWrap = el('div', { className: 'formulas-table-wrap hitviz-scroll-table' });
  tableWrap.appendChild(buildTable(
    [['When the hidden boxes…', ''], ['What that means', ''], ['Result', '']],
    [
      ['Overlap', 'The attack and monster hitboxes share real space in both directions.', 'The monster becomes eligible.'],
      ['Only touch at an edge', 'The hitboxes meet, but share no area.', 'The monster is not eligible.'],
      ['Visible sprites touch', 'The game ignores visible weapon, projectile, monster, and effect pixels for this check.', 'A visible touch alone does not count.'],
    ],
  ));
  container.appendChild(tableWrap);
  container.appendChild(el('div', {
    className: 'formulas-note formulas-note--padded',
    textContent: 'Overlap only makes a monster eligible. Target priority, the skill\'s target cap, and, when used, the terrain check decide whether it stays in the final target list.',
  }));
  return container;
}

function buildHitDetectionDetails(summaryText, rows) {
  const details = el('details', { className: 'hitviz-details' });
  details.appendChild(el('summary', { textContent: summaryText }));
  const body = el('div', { className: 'hitviz-details-body' });
  rows.forEach(([label, textContent]) => {
    const row = el('div', { className: 'hitviz-details-row' });
    row.appendChild(el('strong', { textContent: label }));
    row.append(textContent);
    body.appendChild(row);
  });
  details.appendChild(body);
  return details;
}

function buildTerrainBypassGuide() {
  const container = el('div', { className: 'formulas-table-wrap hitviz-scroll-table' });
  container.appendChild(el('div', {
    className: 'formulas-subhead',
    textContent: 'Full skill breakdown',
  }));

  container.appendChild(buildTable(
    [['Attack group', ''], ['Terrain result', ''], ['Examples', '']],
    [
      ['Basic ranged attacks', 'Checks terrain', 'Regular bow, crossbow, and throwing-star attacks.'],
      ['Projectile skills', 'Checks terrain', 'Three Snails, Arrow Blow, Double Shot, Arrow Bomb, Iron Arrow, Inferno, Strafe, Blizzard, Lucky Seven, Drain, Shadow Meso, Avenger, Energy Bolt, Fire Arrow, Poison Breath, Poison Mist, Element Composition, and Holy Arrow.'],
      ['Direct magic and Heal', 'Skips terrain', 'Magic Claw, both Slow skills, Cold Beam, Thunder Bolt, Ice Strike, Thunder Spear, Shining Ray, Doom, and Heal against undead monsters.'],
      ['Melee and weapon-hitbox skills', 'Skips terrain', 'Basic melee attacks, Power Strike, Slash Blast, Panic, Coma, Charged Blow, Dragon Fury, Power Knockback, Disorder, Double Stab, and Savage Blow.'],
      ['Area and control skills', 'Skips terrain', 'Shout, Armor Crash, Threaten, Elemental Crash, Piercing Crusher, Dragon Roar, Power Crash, Seal, Shadow Web, Steal, Explosion, Arrow Rain, and Arrow Eruption.'],
      ['Special targeting', 'Skips terrain', 'Rush, Assaulter, Band of Thieves, and Meso Explosion.'],
    ],
  ));
  container.appendChild(buildHitDetectionDetails('How terrain checks work', [
    ['Projectile skills. ', 'Only projectile skills turn on the target-by-target terrain filter. Basic ranged attacks have their own wall check.'],
    ['Other attacks. ', 'Melee, area, and direct magic attacks skip that filter. Their hitboxes still need to reach the monster, but a platform edge does not remove it from the target list.'],
    ['The animation does not decide it. ', 'A skill can show arrows, claws, or another flying effect and still skip terrain. Arrow Rain, Arrow Eruption, and Magic Claw are examples.'],
  ]));
  return container;
}

function buildTargetSelectionGuide() {
  const container = el('div', { className: 'formulas-formula-wrap' });

  const intro = el('aside', { className: 'hitviz-terrain-intro' });
  intro.appendChild(el('div', {
    className: 'hitviz-terrain-intro-title',
    textContent: 'Overlap makes a monster eligible, not guaranteed',
  }));
  intro.appendChild(el('p', {
    textContent: 'When more monsters overlap than the skill can hit, target priority decides which ones fill the available slots. Most attacks do not guarantee closest-first targeting.',
  }));
  container.appendChild(intro);

  const selectionWrap = el('div', { className: 'formulas-table-wrap hitviz-scroll-table' });
  selectionWrap.appendChild(buildTable(
    [['Attack type or rule', ''], ['How eligible monsters are ordered', '']],
    [
      ['Most skills', 'Uses the game\'s internal monster order rather than sorting closest-first (the exact ordering rule is not yet known).'],
      ['Basic attacks', 'Uses the same internal monster order, so the closest monster is not guaranteed to be hit first.'],
      ['Ranged skills with a targeting cone', 'Closest monster to your feet first.'],
      ['Band of Thieves', 'Closest monster first. If that monster is behind you, the skill prefers the closest monster in front; if none is in front, it keeps the original choice.'],
      ['Meso Explosion', 'Checks dropped mesos in internal drop order. A drop is selected only if a monster is within its blast area, stopping at the skill\'s drop limit.'],
    ],
  ));
  container.appendChild(selectionWrap);
  container.appendChild(el('div', {
    className: 'formulas-note formulas-note--padded',
    textContent: 'The game fills the skill\'s target cap first, with a hard maximum of 15. Attacks that check terrain then remove blocked targets without filling the empty slots, so priority matters when too many monsters are in range.',
  }));
  return container;
}

function buildFinalTargetGuide() {
  const container = el('div', { className: 'formulas-formula-wrap' });

  const terrainIntro = el('aside', { className: 'hitviz-terrain-intro' });
  terrainIntro.appendChild(el('div', {
    className: 'hitviz-terrain-intro-title',
    textContent: 'Which attacks are stopped by terrain?',
  }));
  terrainIntro.appendChild(el('p', {
    textContent: 'Only basic ranged attacks and projectile skills check terrain. Other attacks skip this step, even when their animation looks like a projectile.',
  }));
  container.appendChild(terrainIntro);

  container.appendChild(buildRangedTerrainComparisonVisual());

  container.appendChild(buildObstructionVisual());

  const platformDirectionGrid = el('div', { className: 'hitviz-type-grid hitviz-type-grid--comparison' });
  platformDirectionGrid.appendChild(buildDownwardPlatformObstructionVisual());
  platformDirectionGrid.appendChild(buildUpwardPlatformClearVisual());
  container.appendChild(platformDirectionGrid);

  container.appendChild(buildTerrainBypassGuide());

  return container;
}

function buildSkillHitDetectionCases() {
  const container = el('div', { className: 'formulas-formula-wrap' });

  const tableWrap = el('div', { className: 'formulas-table-wrap hitviz-scroll-table' });
  tableWrap.appendChild(buildTable(
    [['Skill or family', ''], ['Target check', ''], ['Special result', '']],
    [
      ['Slash Blast / Coma / Charged Blow', 'The first swing must find exactly one monster before the larger hitbox is used.', 'Only the forward range grows. If the first swing finds zero or more than one monster, the hitbox stays the same.'],
      ['Band of Thieves', 'The opening swing must find exactly one monster before the full attack hitbox is used.', 'It uses the special closest-first rule described above and skips the terrain check.'],
      ['Meso Explosion', 'It first selects nearby dropped mesos, then searches for a monster around each selected drop.', 'It skips the terrain check.'],
    ],
  ));
  container.appendChild(tableWrap);

  return container;
}

function buildWeaponMultTable() {
  const container = el('div');

  const split = el('div', { className: 'formulas-exp-split' });

  const multWrap = el('div', { className: 'formulas-table-wrap' });
  multWrap.appendChild(el('div', { className: 'formulas-subhead', textContent: 'Multipliers' }));
  multWrap.appendChild(buildTable(
    [['Weapon Type', ''], ['Swing', 'num'], ['Stab', 'num'], ['Shoot', 'num'], ['Other', 'num']],
    WEAPON_MULTS
  ));
  split.appendChild(multWrap);

  const rollWrap = el('div', { className: 'formulas-table-wrap' });
  rollWrap.appendChild(el('div', { className: 'formulas-subhead', textContent: 'Swing/Stab Ratio' }));
  rollWrap.appendChild(buildTable(
    [['Weapon Type', ''], ['Swing', 'num'], ['Stab', 'num']],
    ACTION_SPLIT
  ));
  split.appendChild(rollWrap);

  container.appendChild(split);

  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The multiplier category depends on the attack animation and skill rules. Swing and Stab cover normal melee attacks; Shoot covers normal bow, crossbow, and claw shots. Custom animations such as Rush fall into Other, with exceptions like Savage Blow counting as Stab. Lucky Seven overrides its claw multiplier to 3.0.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The Swing/Stab ratio above applies to melee attacks (including bow, crossbow, or claw melee hits when out of ammo). Normal ranged bow, crossbow, and throwing-star attacks always use Shoot.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Skills without a dedicated animation fall back to the weapon\'s normal attack list. The groups below always use the same multiplier category regardless of animation. Weapon defaults are Stab for 1H/2H Swords, Daggers, Spears, Wands, Staves, and bare hands; Swing for Axes, Blunt Weapons, and Polearms; and Shoot for Bows, Crossbows, and Claws. Magic damage and non-damaging debuffs (such as Threaten and Slow) do not use a weapon multiplier.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Third-job skills (such as Avenger, Assaulter, Meso Explosion, Shout, and Dragon Fury) are not available in this version and are omitted from the list below.' }));

  const exceptions = el('div', { className: 'formulas-exceptions' });
  ACTION_EXCEPTIONS.forEach(([column, skills]) => {
    exceptions.appendChild(el('span', { className: 'formulas-exc-label', textContent: column }));
    exceptions.appendChild(el('span', { className: 'formulas-exc-skills', textContent: skills.join(', ') }));
  });
  container.appendChild(exceptions);

  return container;
}

function buildAccuracySection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(ACCURACY_STEPS));
  container.appendChild(buildVarLegend(ACCURACY_VARS));
  return container;
}

function buildBaseDamageSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(BASE_DAMAGE_STEPS));
  container.appendChild(buildVarLegend(BASE_DAMAGE_VARS));
  return container;
}

function buildModsSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(MOD_PIPELINE_STEPS, {
    0: { key: 'opening-modifiers', label: 'Opening Modifiers', description: 'Class buffs and defense-breaking effects applied before ordinary defense.' },
    3: { key: 'defense-elements', label: 'Defense & Elements', description: 'The target’s defenses, elemental response, and level-based scaling.' },
    8: { key: 'hit-effects', label: 'Hit Effects', description: 'Criticals and skill-specific effects that shape individual hits.' },
    11: { key: 'final-result', label: 'Final Result', description: 'Immunity overrides and final minimum and maximum damage bounds.' },
  }));
  container.appendChild(buildVarLegend(MOD_VARS));
  return container;
}

// ─── Damage taken calculator ──────────────────────────────────

// Filled in by renderFormulas from the same appData the Monsters tab uses, so the
// calculator lists the real mobs with their real attack stats.
let CALC_MONSTERS = [];
let GRAPH_ITEMS = [];
let GRAPH_DATA;

// The current version applies fractional and flat defense reductions, then truncates and clamps.
const CALC_CONFIG = {
  get monsters() { return CALC_MONSTERS; },
  damageFormula: (incoming, defense, level) => incoming * (1 - defense / (defense + 2 * incoming + 300))
    - defense / 25 - level / 10,
  scale: (incoming, level, defense) => defense + 2 * incoming + 300,
  scaleTerms: (incoming, level, defense) => `${defense} + 2 × ${incoming.toLocaleString()} + 300`,
  defenseLabel: 'Defense denominator',
  maxLevel: 100,
  useLevel: true,
  rollMin: 1.2,
  rollMax: 1.4,
  notes: (magic) => [
    'Assumes the attack lands. A miss deals 0, and accuracy is not modeled here — see Monster Accuracy above.',
    magic
      ? 'Monster skill attacks cannot miss or be guarded, and use your Magic Defense.'
      : 'Regular attacks use your Weapon Defense and can be missed or guarded.',
    'Invincible and elemental resistance are not modeled here and reduce incoming damage further.',
  ],
};

function buildGuardSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(GUARD_STEPS, {
    0: { key: 'hit-check', label: 'Hit Check', description: 'Whether an ordinary monster attack reaches the player.' },
    1: { key: 'guard-resolution', label: 'Guard Resolution', description: 'Immunity and shield or claw guard checks.' },
    4: { key: 'damage-reduction', label: 'Damage Reduction', description: 'Incoming roll, player defense, and additional reductions.' },
    8: { key: 'incoming-result', label: 'Result', description: 'Final damage taken after hit, guard, and defense checks.' },
  }));
  if (CALC_MONSTERS.length) container.appendChild(buildCalcLauncher(CALC_CONFIG));
  container.appendChild(buildVarLegend(GUARD_VARS));
  return container;
}

// ─── Page render ──────────────────────────────────────────────

export function renderFormulas(data, options = {}) {
  GRAPH_ITEMS = data?.items?.items ?? [];
  GRAPH_DATA = deriveGraphData(data, WEAPON_MULTS);
  // Sorted by level so the picker reads top-down like the Monsters tab does.
  CALC_MONSTERS = [...(data?.monsters?.monsters ?? [])]
    .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  const section = (title, key, bodyFn) => markFormulaSection(makeCollapsibleSection(title, '', bodyFn), key);
  const group = (...children) => el('div', { className: 'formulas-full' }, ...children);

  const buildAccuracyPage = () => {
    const accuracy = section('Accuracy', 'accuracy-formulas', buildAccuracySection);
    accuracy.querySelector('.right').appendChild(makeStatusTag('stale', 'Verified against game data.'));
    const credit = el('span', { className: 'formulas-credit' });
    credit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> and <strong>@ohmi</strong> on Discord';
    accuracy.querySelector('.left').appendChild(credit);
    return group(accuracy);
  };

  const buildHitDetectionPage = () => {
    const overview = section('How Targeting Works', 'targeting-pipeline', buildHitDetectionOverview);

    const area = section('1. Build the Attack Hitbox', 'attack-families', buildAttackAreaGuide);

    const overlap = section('2. Find Overlapping Monsters', 'target-overlap', buildOverlapGuide);

    const priority = section('3. Apply Target Priority and Cap', 'target-priority', buildTargetSelectionGuide);

    const finalTargets = section('4. Check Blocking Terrain', 'ranged-terrain', buildFinalTargetGuide);

    const cases = section('Skills with Special Targeting Rules', 'skill-cases', buildSkillHitDetectionCases);

    return group(overview, area, overlap, priority, finalTargets, cases);
  };

  const buildDamagePage = () => {
    const base = section('Base Damage Formulas', 'base-damage', buildBaseDamageSection);
    const baseCredit = el('span', { className: 'formulas-credit' });
    baseCredit.innerHTML = 'Reverse engineered by <strong>@Slash, @kirbypickr, @sublimerealist, @jimmybald</strong> and <strong>@ohmi</strong> on Discord';
    base.querySelector('.left').appendChild(baseCredit);

    const weapons = section('Weapon Min/Max Multipliers', 'weapon-multipliers', buildWeaponMultTable);
    weapons.querySelector('.right').appendChild(makeStatusTag('stale', 'Verified against game weapon multiplier data.', null));
    const weaponCredit = el('span', { className: 'formulas-credit' });
    weaponCredit.innerHTML = 'Reverse engineered by <strong>@kirbypickr, @Slash, @cptbattler, @ohmi</strong> on Discord';
    weapons.querySelector('.left').appendChild(weaponCredit);

    const mods = makeCollapsibleSection('Damage Modification Pipeline', '', buildModsSection);
    const modsCredit = el('span', { className: 'formulas-credit' });
    modsCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
    mods.querySelector('.left').appendChild(modsCredit);
    return group(base, weapons, mods);
  };

  const buildDamageTakenPage = () => {
    const guard = makeCollapsibleSection('Damage Taken Pipeline', '', buildGuardSection);
    guard.querySelector('.right').appendChild(makeStatusTag('stale', 'Verified against game incoming-hit rules (hit, miss, and guard).'));
    const credit = el('span', { className: 'formulas-credit' });
    credit.innerHTML = 'Reverse engineered by <strong>@ohmi</strong> on Discord';
    guard.querySelector('.left').appendChild(credit);
    return group(guard);
  };

  const buildProgressionPage = () => {
    const exp = section('Experience Table', 'experience', buildExpTable);
    exp.querySelector('.right').appendChild(makeStatusTag('stale', 'Verified against game experience table data.', null));
    exp.querySelector('.right').appendChild(buildComparisonTag());
    exp.querySelector('.collapsible-body').appendChild(buildComparisonNotes([
      'The level cap drops from 120 to 100. EXP requirements match through level 89, then rise sharply: level 90 takes 11,938,059 EXP instead of 5,996,316, likely a softcap.',
    ]));
    const expCredit = el('span', { className: 'formulas-credit' });
    expCredit.innerHTML = 'Reverse engineered by <strong>@wolffy</strong> and <strong>@ohmi</strong> on Discord';
    exp.querySelector('.left').appendChild(expCredit);

    const craft = section('Crafting Levels', 'crafting-levels', buildCraftTable);
    craft.querySelector('.right').appendChild(makeStatusTag('stale', 'EXP values verified from game data; character level gates from in-game crafting tooltips.'));
    craft.querySelector('.right').appendChild(buildComparisonTag());
    craft.querySelector('.collapsible-body').appendChild(buildComparisonNotes([
      'Crafting now stops at level 9, so level 10 is unavailable. Levels 1-9 keep the same EXP requirements and character-level gates.',
    ]));

    const citizenship = section('Citizenship Grades', 'citizenship-grades', buildCitizenshipTable);
    citizenship.querySelector('.right').appendChild(makeStatusTag('ok', 'Contribution thresholds, character level requirements, and grade names verified against the current version.'));
    citizenship.querySelector('.right').appendChild(buildComparisonTag());
    citizenship.querySelector('.collapsible-body').appendChild(buildComparisonNotes([
      'Grades 2-5 cost more contribution and grades 7-10 cost less; the full climb drops from 46,000 to 45,000 total.',
    ]));
    return group(exp, craft, citizenship);
  };

  return createFormulaBrowser({
    notice: null,
    initialParams: options.initialParams,
    setNavigate: options.setNavigate,
    pages: [
      {
        key: 'accuracy', label: 'Accuracy', kicker: 'Will the attack connect?',
        description: 'Player accuracy, monster avoidability, and the physical and magical hit checks.',
        sections: [{ key: 'accuracy-formulas', label: 'Accuracy formulas' }], render: buildAccuracyPage,
      },
      {
        key: 'hit-detection', label: 'Hit Detection', kicker: 'Which monster can the attack reach?',
        description: 'See where each attack checks for monsters and which attacks terrain can block.',
        sections: [
          { key: 'targeting-pipeline', label: 'Overview' },
          { key: 'attack-families', label: '1. Attack hitbox' },
          { key: 'target-overlap', label: '2. Overlap' },
          { key: 'target-priority', label: '3. Priority & cap' },
          { key: 'ranged-terrain', label: '4. Terrain' },
          { key: 'skill-cases', label: 'Special rules' },
        ],
        render: buildHitDetectionPage,
      },
      {
        key: 'dealing-damage', label: 'Dealing Damage', kicker: 'From stats to the applied hit',
        description: 'Trace one outgoing hit from its base roll through defenses, elements, criticals, and the final clamp.',
        flow: buildDamageFlow,
        sections: [
          { key: 'base-damage', label: 'Base damage' },
          { key: 'weapon-multipliers', label: 'Weapons' },
          { key: 'opening-modifiers', label: 'Opening modifiers' },
          { key: 'defense-elements', label: 'Defense & elements' },
          { key: 'hit-effects', label: 'Hit effects' },
          { key: 'final-result', label: 'Final result' },
        ],
        render: buildDamagePage,
      },
      createStatEquivalencyPage(CALC_MONSTERS),
      {
        key: 'damage-taken', label: 'Damage Taken', kicker: 'What happens when a monster attacks?',
        description: 'Follow the hit check, guard roll, player defense formula, reductions, and final incoming result.',
        sections: [
          { key: 'hit-check', label: 'Hit check' }, { key: 'guard-resolution', label: 'Guards' },
          { key: 'damage-reduction', label: 'Damage reduction' }, { key: 'incoming-result', label: 'Result' },
        ],
        render: buildDamageTakenPage,
      },
      {
        key: 'progression', label: 'Tables & Progression', kicker: 'Character and profession milestones',
        description: 'Look up experience requirements, crafting levels, and citizenship grades.',
        sections: [
          { key: 'experience', label: 'Experience' }, { key: 'crafting-levels', label: 'Crafting' },
          { key: 'citizenship-grades', label: 'Citizenship' },
        ],
        render: buildProgressionPage,
      },
      createMobSpawningPage(),
      createExpPage(CALC_MONSTERS),
      createMesoPage(CALC_MONSTERS),
    ],
  });
}
