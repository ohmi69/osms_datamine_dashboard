import { el } from '../lib/utils.js';
import { buildCalcLauncher } from './formulas-calc.js';
import { tokenizeLine, attachTooltip, makeCollapsibleSection, buildVarLegend, buildTable } from './formulas-shared.js';
import { createFormulaBrowser, markFormulaSection, buildDamageFlow } from './formulas-layout.js';

const EXP_TABLE = [
  [1, 2, 15], [2, 3, 34], [3, 4, 57], [4, 5, 92], [5, 6, 135],
  [6, 7, 372], [7, 8, 560], [8, 9, 840], [9, 10, 1242], [10, 11, 1716],
  [11, 12, 2360], [12, 13, 3216], [13, 14, 4200], [14, 15, 5460],
  [15, 16, 7050], [16, 17, 8840], [17, 18, 11040], [18, 19, 13716],
  [19, 20, 16680], [20, 21, 20216], [21, 22, 24402], [22, 23, 28980],
  [23, 24, 34320], [24, 25, 40512], [25, 26, 47216], [26, 27, 54900],
  [27, 28, 63666], [28, 29, 73080], [29, 30, 83720], [30, 31, 95700],
  [31, 32, 108480], [32, 33, 122760], [33, 34, 138666], [34, 35, 155540],
  [35, 36, 174216], [36, 37, 194832], [37, 38, 216600], [38, 39, 240500],
  [39, 40, 266682], [40, 41, 294216], [41, 42, 324240], [42, 43, 356916],
  [43, 44, 391160], [44, 45, 428280], [45, 46, 468450], [46, 47, 510420],
  [47, 48, 555680], [48, 49, 604416], [49, 50, 655200],
];

// Read from the COT1 client's startup table builder. The level cap is 50: the
// generation loop stops there, the accessor rejects anything above it, and the
// 1.0548 geometric tail COT2 uses past level 50 does not exist in the COT1 binary.
// The 50 → 51 row of 709,716 that used to end this table matches the rule extended
// one level, but the COT1 client never computes it. See tmp/exp-table-cot1-binary.md.
const EXP_RULES = [
  ['Level 1 to 5', 'Exp = (floor(Level² / 2) + 15) × Level'],
  ['Level 6 to 49', 'Exp = (floor(Level² / 3) + 19) × floor(Level² / 3)'],
  ['Level cap', '50 - there is no formula past level 49'],
];

// Read from the COT1 weapon-multiplier struct builder (0x1402ac5d0). Meleeing
// with a Bow, Crossbow or Claw keeps a 1.0 multiplier but divides the stat terms
// by 300 (see the Physical Damage notes); 2.5 is the Shoot value only.
const WEAPON_MULTS = [
  ['1H Sword',        1.8, 1.8, '-'],
  ['2H Sword',        2.5, 2.5, '-'],
  ['1H Blunt Weapon', 2.4, 1.2, '-'],
  ['2H Blunt Weapon', 3,   2,   '-'],
  ['1H Axe',          2.4, 1.2, '-'],
  ['2H Axe',          3,   2,   '-'],
  ['Spear',           1.5, 3.5, '-'],
  ['Polearm',         3.5, 1.5, '-'],
  ['Bow',             1.0, 1.0, 2.5],
  ['Crossbow',        1.0, 1.0, 2.5],
  ['Claw',            1.0, 1.0, 2.5],
  ['Dagger',          1,   2,   '-'],
  ['Wand',            1.8, 1.8, '-'],
  ['Staff',           1.8, 1.8, '-'],
  ['Barehanded',      1,   1,   '-'],
];

// How the client picks a basic attack's animation: a uniform draw from the list the
// weapon owns. The odds are just the make-up of that list - three swings and
// two stabs gives 60/40. Read from the same animation-list tables COT2 uses -
// verified record-for-record identical in the old binary, so this table is shared.
// This is the MELEE list. Bows, Crossbows and Claws have a second, ranged list which
// is what a normal shot actually uses, so for those three weapons the rows below
// are only reached when meleeing without ammo.
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

// ─── Accuracy ────────────────────────────────────────────────

// Derived from the COT1 client binary (C:\Users\brian\Downloads\Maplestory.exe,
// sha256 c4201971...). See tmp/accuracy-cot1-binary.md.
const ACCURACY_STEPS = [
  {
    label: 'Base Accuracy & Avoidability',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'Acc = Dex / 3 + Luk / 6 + 5',
      '',
      'Avoid = Luk / 3 + Dex / 6 + 5',
    ],
    notes: [
      'One formula for every class, with no class differences or level scaling.',
      'Every stat here is the total including equipment and buffs. Flat accuracy from items and buffs is added on top, and the result is clamped to 0–9,999.',
      'Base critical rate is 5% and base critical damage is 20%.',
    ],
  },
  {
    label: 'Physical Accuracy',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics. Matches the formula found by players during COT1.',
    lines: [
      'BaseChance = Acc × 100 / ((max(0, LevelDiff) + 51) × 5)',
      '',
      'Spread = 0.05 + 0.3 / (1 + exp((BaseChance − Avoid) / 12))',
      '',
      'Roll = rand(1 − Spread, 1 + Spread)',
      '',
      'DidHit = Roll × BaseChance ≥ Avoid',
    ],
    notes: [
      'exp() is the exponential function.',
      'Attacks also auto-hit when BaseChance − Avoid ≥ 25, regardless of level. Some monsters (likely bosses) are immune to auto-hits.',
      'COT1 has no miss-chance debuff and no skills that bypass accuracy.',
    ],
  },
  {
    label: 'Magical Accuracy',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics: magic attacks have no accuracy check.',
    lines: [
      'Magical skills always hit - there is no accuracy check for magic.',
    ],
    notes: [],
  },
];

const ACCURACY_VARS = [
  { name: 'Acc',       desc: "Player's Accuracy stat value" },
  { name: 'Dex',       desc: "Player's total DEX, including equipment and buffs" },
  { name: 'Luk',       desc: "Player's total LUK, including equipment and buffs" },
  { name: 'Avoid',     desc: "Enemy's Avoid stat value" },
  { name: 'LevelDiff', desc: 'Enemy level minus player level, or 0 if player level ≥ enemy level' },
];

// ─── Base Damage ──────────────────────────────────────────────

// Derived from the COT1 client binary. See tmp/base-damage-cot1-binary.md.
const BASE_DAMAGE_STEPS = [
  {
    label: 'Physical Damage',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics. The stat-window preview divided AttackPower by 100, while actual combat counted it double (divided by 50).',
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
        'WepMult is chosen by the attack action, not by the skill — see the Weapon Multipliers table. Lucky Seven overrides it to 2.6 instead of the Claw\'s 2.5.',
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
      'Lucky Seven   forces WepMult = 2.6 in place of the Claw Shoot 2.5',
    ],
    notes: [
      'StatRoll and BaseRoll are separate rolls: a hit can land low on one and high on the other, so damage clusters toward the middle.',
      'With the usual StatDiv of 100 and AtkDiv of 50, this reduces to the simple form.',
      'WepMult is chosen by the attack action, not by the skill — see the Weapon Multipliers table.',
      'AttackPower counts double in combat. The stat window preview divides it by 100 instead.',
      'Normal Bow, Crossbow, and Claw shots use Shoot (2.5, StatDiv 100). The StatDiv 300 rows apply when meleeing with them — for example, stabbing with a Claw when out of stars (1.0).',
      'Drain and normal attacks use the standard 2.5 Claw multiplier, not Lucky Seven\'s 2.6.',
    ],
  },
  {
    label: 'Magical Damage',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics. BaseInt uses base INT from AP only, excluding equipment.',
    lines: [
      'MIN = (BasicAttack + Magic / 7) × ((Magic × 2 × MasteryMult + BaseInt) / 100 + 1)',
      'MAX = (BasicAttack + Magic / 7) × ((Magic × 2 + BaseInt) / 100 + 1)',
    ],
    warnings: [
      'Magic here is the MAGIC stat on your stat window (Total Int / 2 plus gear Magic Attack plus buffs), not the Magic Attack total from your gear on its own.',
    ],
    notes: [
      'BaseInt uses base INT from AP only — INT from equipment and scrolls is excluded from the bracket (though it still counts toward Magic).',
    ],
  },
  {
    label: 'Heal',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'HealAmount = ((BaseInt × Roll + BaseLuk) / 200 + 3) × Magic × (RecoveryRate / 100) × (TargetsHit × 0.1 + 1)',
      '',
      'Roll = rand(0.8, 1.0)',
      '',
      'Damage = trunc(HealAmount) / TargetsHit × 0.5',
    ],
    notes: [
      'BaseInt and BaseLuk are base stats from AP only, excluding equipment.',
      'TargetsHit counts party members in range (at least 1, at most 6, including the caster) plus undead enemies hit (up to 15).',
      'Damage against undead is the heal amount divided by targets, then halved.',
    ],
  },
  {
    label: 'Damage Over Time (DoT)',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'TotalDamage = (DoTBasicAttack + Magic / 7) × ((Magic + BaseInt) / 100 + 1)',
      '',
      'DamagePerTick = TotalDamage / DoTDurationSeconds',
    ],
    notes: [
      'DoT damage ignores all enemy Defense reductions.',
      'The level difference penalty always uses its linear branch for DoT.',
    ],
  },
  {
    label: 'Physical Damage Over Time (DoT)',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'TotalDamage = (DoTBasicAttack / 100) × WeaponAttack × ((PrimaryStat × 2 + SecondaryStat) / 100 + AttackPower / 50 + 1)',
      '',
      'DamagePerTick = TotalDamage / DoTDurationSeconds',
    ],
    notes: [
      'Weapon-attack based, unlike the magic DoT above — PrimaryStat, SecondaryStat, and WepMult come from the same weapon table as a normal physical hit.',
      'DoT damage ignores all Defense reductions, always uses the linear level difference penalty, and its ticks can crit.',
    ],
  },
];

const BASE_DAMAGE_VARS = [
  { name: 'SkillMult',     desc: 'Skill Damage % as a decimal (e.g. 120% → 1.2)' },
  { name: 'PrimaryStat',   desc: 'Set by weapon type:\nStr - Melee Weapons (1H/2H Swords, Axes, Blunt Weapons, Spears, Polearms, Barehands, and Staves/Wands while whacking)\nDex - Bows and Crossbows\nLuk - Daggers and Claws' },
  { name: 'SecondaryStat', desc: 'Set by weapon type:\nDex - Melee Weapons\nStr - Bows and Crossbows\nStr + Dex - Daggers and Claws' },
  { name: 'AttackPower',   desc: 'Attack from all gear other than the weapon and shield, plus buffs' },
  { name: 'WeaponAttack',  desc: 'Attack from the weapon and shield, plus Stars and Arrows' },
  { name: 'WepMult',       desc: 'Weapon multiplier for the attack action used — see Weapon Multipliers table' },
  { name: 'MasteryMult',   desc: '(0.1 + MasteryLevel / 10) × 0.8. Exception: Lucky Seven uses its own fixed mastery multiplier.' },
  { name: 'BasicAttack',   desc: 'Basic Attack damage value listed on the skill, for magic skills only' },
  { name: 'DoTBasicAttack', desc: 'The "deals N Basic Attack over X sec" value listed on the skill' },
  { name: 'Magic',              desc: 'The MAGIC value shown on your stat window: Total INT / 2 plus equipment Magic Attack and buffs. Every magic formula uses this combined stat.' },
  { name: 'EquipmentMagicAttack', desc: 'Total Magic Attack from all gear (including scrolled stats), which feeds into Magic.' },
  { name: 'BaseInt',       desc: 'Base INT from AP only (excludes equipment and buffs).' },
  { name: 'BaseLuk',       desc: 'Base LUK from AP only (excludes equipment and buffs).' },
  { name: 'RecoveryRate',  desc: 'Heal skill recovery rate %' },
  { name: 'TargetsHit',    desc: 'Total targets hit: party members in range (min 1, max 6, caster included) + undead enemies hit (max 15)' },
  { name: 'DoTDurationSeconds', desc: 'Duration of the DoT effect in seconds' },
];

// ─── Damage Modifications ─────────────────────────────────────

// Derived from the COT1 client binary. See tmp/damage-modifiers-cot1-binary.md.
const MOD_PIPELINE_STEPS = [
  {
    label: 'Weapon Defense',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'WeaponDefense = max(0, trunc(BaseWeaponDefense × (PercentEffects / 100 + 1)) + FlatEffects)',
      '',
      'Damage = Damage × 100 / (WeaponDefense + 100)',
    ],
    notes: [
      'trunc() rounds toward zero (down for positive, up for negative).',
      'Applies to Physical damage only.',
      'This is for monsters only. Damage taken by players uses a different formula — see the Damage Taken section.',
      'Crossbow Mastery (Crossbowman line) rolls its Ignore Defense chance once per attack; when it triggers, this entire defense step is skipped. This is the only Ignore Defense effect in COT1 — Blunt Weapon Mastery is a stun passive instead.',
    ],
  },
  {
    label: 'Magic Defense',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'Damage = Damage × 100 / (MagicDefense + 100)',
    ],
    notes: [
      'Applies to Magical damage only.',
      'Uses the monster\'s base Magic Defense directly, with no defense debuffs or modifiers.',
      'This is for monsters only. Damage taken by players uses a different formula — see the Damage Taken section.',
      'There is no Ignore Defense proc for magic, and no magic equivalent of Armor Crash.',
    ],
  },
  {
    label: 'Elemental Modifier',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'Damage = Damage × ElementalMult',
      '  0.0  - immune',
      '  0.75 - resistant',
      '  1.0  - neutral',
      '  1.25 - weak against element',
    ],
    notes: [
      'Only these four single-element values apply (anything else is treated as neutral 1.0). Element Composition and dual-element blending do not exist in COT1.',
    ],
  },
  {
    label: 'Level Difference Penalty',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'LevelDiff = EnemyLevel − PlayerLevel',
      '',
      'No penalty if LevelDiff ≤ 0',
      '  LevelDiff < 10:  Damage = Damage / (LevelDiff² × 0.005 + 1)',
      '  LevelDiff ≥ 10:  Damage = Damage / (LevelDiff × 0.05 + 1)',
    ],
    notes: [
      'Both branches meet at LevelDiff 10, where damage is divided by 1.5 (about a third lost).',
      'DoT always uses the linear branch.',
    ],
  },
  {
    label: 'Critical Hit',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'IsCrit = rand(0, 99) < CritRate',
      '',
      'Damage = Damage × (100 + CritDamage) / 100',
    ],
    notes: [
      'Power Knockback (both Hunter and Crossbowman versions) always crits.',
      'DoT ticks can also crit.',
    ],
  },
  {
    label: 'Iron Arrow Falloff (Crossbow only)',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'Damage = Damage × clamp(1 − ConsecutiveHits × 0.2, 0, 1)',
      '  1st mob: ×1.0,  2nd: ×0.8,  3rd: ×0.6 …',
    ],
    notes: [],
  },
  {
    label: 'Combo Attack, Elemental Charge, Armor Crash, Element Amplification, Shadow Partner',
    wip: false,
    status: 'ok',
    statusNote: 'Not present in COT1.',
    lines: [
      'None of these exist in COT1.',
    ],
    notes: [
      'COT1 has no Combo Attack orb bonus, Elemental Charge multiplier, Armor Crash defense removal, Element Amplification, or Shadow Partner hit split.',
    ],
  },
  {
    label: 'Clamp',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'Damage = trunc(Damage)',
      'Damage = clamp(Damage, 1, 700,000,000,000)',
    ],
    notes: [
      'Per-hit damage is capped at 700,000,000,000 and floored at 1.',
    ],
  },
];

const MOD_VARS = [
  { name: 'BaseWeaponDefense', desc: "Enemy's weapon defense stat, before modifiers" },
  { name: 'WeaponDefense',   desc: "Enemy's weapon defense after percent and flat modifiers, floored at 0" },
  { name: 'PercentEffects',  desc: "Percentage modifiers to the monster's weapon defense (such as Threaten)" },
  { name: 'FlatEffects',     desc: "Flat modifiers to the monster's weapon defense, added after percentage modifiers" },
  { name: 'MagicDefense',    desc: "Enemy's base magic defense stat (no modifiers in COT1)" },
  { name: 'ElementalMult',   desc: 'Elemental modifier: 0.0, 0.75, 1.0, or 1.25' },
  { name: 'EnemyLevel',      desc: "Enemy's level" },
  { name: 'PlayerLevel',     desc: "Player's level" },
  { name: 'LevelDiff',       desc: 'Enemy level minus player level. No penalty when this is 0 or below' },
  { name: 'CritRate',        desc: 'Critical hit rate % from the Stats panel' },
  { name: 'CritDamage',      desc: 'Critical damage % from the Stats panel (e.g. 20 → a ×1.2 multiplier)' },
  { name: 'ConsecutiveHits', desc: 'Iron Arrow: 0 for first mob hit, 1 for second, etc.' },
];

// ─── Damage taken ─────────────────────────────────────────────

// Derived from the COT1 client binary. See tmp/damage-taken-cot1-binary.md and
// tmp/player-defense-cot1-binary.md.
const GUARD_STEPS = [
  {
    label: 'Monster Accuracy',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'LevelGap = PlayerLevel − MonsterLevel, or 0 if the monster is the higher level',
      '',
      'HitRate = MonsterAcc × 100 / ((LevelGap + 51) × 5)',
      '',
      'AvoidRate = Avoid / (Avoid / 80 + 1) / (LevelGap / 40 + 1)',
      '',
      'Spread = 0.11 + 0.26 / (1 + exp((HitRate − AvoidRate) / 15))',
      'Roll = rand(1 − Spread, 1 + Spread)',
      '',
      'Hit if Roll × HitRate ≥ AvoidRate',
      '',
      'A failed roll still lands 8% of the time, with a further 2-3% chance when the avoid is out of roll reach.',
    ],
    notes: [
      'Avoid is your Avoid stat from the Stats panel, before diminishing returns.',
      'Magic monster skills always hit and cannot be guarded. Unmissable skills skip accuracy but can still be guarded.',
      'Only regular attacks and non-magic monster skills go through this check — see the Result step.',
    ],
  },
  {
    label: 'Guard Immunity',
    wip: false,
    status: 'partial',
    statusNote: 'Confirmed as a mechanic in COT1, though which monsters have it is not yet known.',
    lines: [
      'Certain monsters bypass guard checks entirely.',
    ],
    notes: [
      'Attacks from these monsters always resolve as normal hits and skip the Shield Guard roll below.',
    ],
  },
  {
    label: 'Shield Guard',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'ShieldDefense = Weapon Defense on the item in the shield slot',
      '',
      'Only rolled if ShieldDefense > 0:',
      '  GuardChance = max(0.05, ShieldDefense / (ShieldDefense + 500))',
      '',
      'Guarded = GuardChance > rand(0, 1)',
    ],
    notes: [
      'Only the shield slot counts; a guard fully negates the hit.',
      'Claw Guard does not exist in COT1 — shields are the only way to guard.',
    ],
  },
  {
    label: 'Incoming Damage',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'IncomingDamage = MonsterAttack × (1.1 + 0.4 × rand(0, 1))',
    ],
    notes: [
      "MonsterAttack is the monster's physical attack (including buffs/debuffs) for a regular attack, or its base magic attack for a skill attack.",
    ],
  },
  {
    label: 'Player Defense',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics. Player level does not affect defense in COT1.',
    lines: [
      'Defense = WeaponDefense for a regular attack, MagicDefense for a skill attack',
      '',
      'DamageTaken = IncomingDamage / (1 + Defense / (5 × IncomingDamage))',
    ],
    notes: [
      'Defense scales purely with 5 × the incoming hit — your character level has no effect.',
      'Because the scale shrinks with smaller hits, defense heavily reduces chip damage (pushing small hits toward 1 damage) but does much less against big hits.',
    ],
  },
  {
    label: 'Result',
    wip: false,
    status: 'ok',
    statusNote: 'Verified from COT1 game mechanics.',
    lines: [
      'DamageTaken = clamp(DamageTaken, 1, 50000000), truncated',
      '',
      'DamageTaken = 0 if the hit missed or was guarded',
    ],
    notes: [
      'Guarding fully negates the hit (0 damage taken).',
      'Guard only applies to regular attacks; magic monster skills cannot miss or be guarded.',
    ],
  },
];

const GUARD_VARS = [
  { name: 'MonsterAcc', desc: "The monster's accuracy stat" },
  { name: 'MonsterLevel', desc: "The monster's level" },
  { name: 'LevelGap', desc: "Your level minus the monster's level, or 0 if the monster is the higher level" },
  { name: 'Avoid', desc: 'Your Avoid stat from the Stats panel, before diminishing returns' },
  { name: 'HitRate', desc: "The monster's accuracy scaled against the level gap" },
  { name: 'AvoidRate', desc: 'Your Avoid after diminishing returns and the level-gap scaling' },
  { name: 'ShieldDefense', desc: 'Weapon Defense of the item equipped in the shield slot, including scrolls' },
  { name: 'GuardChance',   desc: 'Chance for the hit to be negated outright' },
  { name: 'MonsterAttack', desc: "The monster's physical attack (regular attack) or magic attack (skill attack), after modifiers" },
  { name: 'IncomingDamage', desc: 'The rolled damage of the hit, before player defense is applied' },
  { name: 'Defense',       desc: "The player's Weapon Defense against a regular attack, or Magic Defense against a skill attack, from the Stats panel" },
  { name: 'DamageTaken',   desc: 'HP actually lost from the hit' },
];

// ─── Shared helpers ───────────────────────────────────────────

function buildPipeline(steps, chapterStarts = {}) {
  const frag = document.createDocumentFragment();
  steps.forEach(({ label, wip, status, statusNote, lines, notes, warnings, simple }, i) => {
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
    if (status) {
      const statusLabels = { ok: 'Verified', partial: 'Partially Verified', warn: 'Unverified' };
      const statusTag = el('span', { className: `formulas-status-tag formulas-status-${status}`, textContent: statusLabels[status] });
      const tooltipText = statusNote ?? (status === 'ok' ? 'Formula has been validated across multiple datapoints and edge cases' : null);
      if (tooltipText) {
        attachTooltip(statusTag, tooltipText);
      }
      stepHeader.appendChild(statusTag);
    }
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

    frag.appendChild(step);
  });
  return frag;
}

// ─── Section builders ─────────────────────────────────────────

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

  const tableWrap = el('div', { className: 'formulas-table-wrap' });
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
  container.appendChild(tableWrap);
  return container;
}

// Physical attack skills that never roll for swing or stab. Re-verified against
// the COT1 client (C:\Users\brian\Downloads\Maplestory.exe, sha256 c4201971...)
// and the COT1 skill data (extractor/extracted/cot1/metadata):
// - the classifier (0x1402AC480) checks property 48 first (wrapper 0x1408E1250,
//   mov edx,0x30), then the single hardcoded skill 3101005, then the action
//   ranges [5,15] swing (claw 47 rewritten to shoot), [16,21] stab, [22,24]
//   shoot, prone 25, the 47-to-stab and 48-to-shoot patches, else default.
//   Property 123 is never queried (all 109 callers of the property reader
//   enumerated - no 0x7B), so there is no Other rule.
// - STAB: Double Stab carries stabO1/stabO2; Savage Blow is the only COT1 skill
//   carrying the savage action, which the 47 patch catches.
// - SHOOT: no COT1 skill uses the avenger action, so the 48 patch has no named
//   rider. The hardcoded skill 3101005 (full level data, no String entry, no
//   action node, properties without 48) always shoots.
// - DEFAULT: the only COT1 skills flagged property 48 are Threaten (1201004),
//   Slow in both mage lines (2101002 and 2201002) and Arrow Bomb: Bow (3101004).
//   Everything else with no action (e.g. Disorder 4001000, properties
//   1/22/109/111) falls through to default anyway.
// Magic skills are left out because magic damage never uses a weapon multiplier.
const ACTION_EXCEPTIONS = [
  ['STAB', ['Double Stab', 'Savage Blow']],
  ['SHOOT', []],
  ['OTHER', []],
  ["WEAPON'S DEFAULT", ['Threaten', 'Slow', 'Arrow Bomb: Bow']],
];

function buildWeaponMultTable() {
  const container = el('div');

  const split = el('div', { className: 'formulas-exp-split' });

  const multWrap = el('div', { className: 'formulas-table-wrap' });
  multWrap.appendChild(el('div', { className: 'formulas-subhead', textContent: 'Multipliers' }));
  multWrap.appendChild(buildTable(
    [['Weapon Type', ''], ['Swing', 'num'], ['Stab', 'num'], ['Shoot', 'num']],
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

  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The multiplier depends on the attack animation, not the skill. Swing and Stab cover normal melee attacks, and Shoot covers bow, crossbow, and claw shots. COT1 has no "Other" category.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The Swing/Stab ratio applies to melee attacks. Bows, Crossbows, and Claws normally use ranged shots (Shoot); their Swing and Stab columns only apply when meleeing at close range or without ammo.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: '* Bow, Crossbow, and Claw melee values: normal shots use Shoot (2.5), while meleeing with them uses 1.0 and divides stat terms by 300 (see Advanced under Physical Damage).' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Most physical skills randomly roll Swing or Stab like a basic attack. The skills below always use a fixed multiplier instead (Weapon\'s Default uses Swing for axes/blunts/polearms, Stab for daggers/spears, and Shoot for bows/crossbows/claws). Magic skills never use a weapon multiplier.' }));

  const exceptions = el('div', { className: 'formulas-exceptions' });
  ACTION_EXCEPTIONS.forEach(([column, skills]) => {
    exceptions.appendChild(el('span', { className: 'formulas-exc-label', textContent: column }));
    exceptions.appendChild(el('span', { className: 'formulas-exc-skills', textContent: skills.length ? skills.join(', ') : '' }));
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
    0: { key: 'defense-elements', label: 'Defense & Elements', description: 'The target’s defenses, elemental response, and level-based scaling.' },
    4: { key: 'hit-effects', label: 'Hit Effects', description: 'Criticals and skill-specific effects that shape individual hits.' },
    7: { key: 'final-result', label: 'Final Result', description: 'Final minimum and maximum damage bounds.' },
  }));
  container.appendChild(buildVarLegend(MOD_VARS));
  return container;
}

// ─── Damage taken calculator ──────────────────────────────────

// Filled in by renderFormulasCot1 from the COT1 patch dataset, so the calculator
// lists COT1's mobs with COT1's attack stats.
let CALC_MONSTERS = [];

// COT1's defense scale is 5 × the hit itself - no level term, no constant.
const CALC_CONFIG = {
  get monsters() { return CALC_MONSTERS; },
  scale: (incoming) => 5 * incoming,
  scaleTerms: (incoming) => `5 × ${incoming.toLocaleString()}`,
  useLevel: false,
  notes: (magic) => [
    'Assumes the attack lands. Misses deal 0 damage and are not modeled here.',
    magic
      ? 'Monster skill attacks cannot miss or be guarded, and use your Magic Defense.'
      : 'Regular attacks use your Weapon Defense and can be missed or guarded.',
    'Character level has no effect on COT1 player defense.',
  ],
};

function buildGuardSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(GUARD_STEPS, {
    0: { key: 'hit-check', label: 'Hit Check', description: 'Whether an ordinary monster attack reaches the player.' },
    1: { key: 'guard-resolution', label: 'Guard Resolution', description: 'Immunity and shield guard checks.' },
    3: { key: 'damage-reduction', label: 'Damage Reduction', description: 'Incoming roll, player defense, and additional reductions.' },
    5: { key: 'incoming-result', label: 'Result', description: 'Final damage taken after hit, guard, and defense checks.' },
  }));
  if (CALC_MONSTERS.length) container.appendChild(buildCalcLauncher(CALC_CONFIG));
  container.appendChild(buildVarLegend(GUARD_VARS));
  return container;
}

// ─── Page render ──────────────────────────────────────────────

export function renderFormulasCot1(data, options = {}) {
  CALC_MONSTERS = [...(data?.monsters?.monsters ?? [])]
    .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  const disclaimer = el('div', { className: 'formulas-disclaimer' });
  const disclaimerText = el('span');
  disclaimerText.appendChild(el('strong', { textContent: 'Archived: ' }));
  disclaimerText.append('Formulas from Closed Online Test 1. Switch to the latest version in Time Travel for current formulas.');
  disclaimer.appendChild(disclaimerText);

  const section = (title, key, bodyFn) => markFormulaSection(makeCollapsibleSection(title, '', bodyFn), key);
  const group = (...children) => el('div', { className: 'formulas-full' }, ...children);

  const buildAccuracyPage = () => {
    const accuracy = section('Accuracy', 'accuracy-formulas', buildAccuracySection);
    const credit = el('span', { className: 'formulas-credit' });
    credit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
    accuracy.querySelector('.left').appendChild(credit);
    return group(accuracy);
  };

  const buildDamagePage = () => {
    const base = section('Base Damage Formulas', 'base-damage', buildBaseDamageSection);
    const baseCredit = el('span', { className: 'formulas-credit' });
    baseCredit.innerHTML = 'Reverse engineered by <strong>@Slash, @kirbypickr, @sublimerealist, @jimmybald</strong> and <strong>@ohmi</strong> on Discord';
    base.querySelector('.left').appendChild(baseCredit);
    const weapons = section('Weapon Min/Max Multipliers', 'weapon-multipliers', buildWeaponMultTable);
    const weaponCredit = el('span', { className: 'formulas-credit' });
    weaponCredit.innerHTML = 'Reverse engineered by <strong>@kirbypickr, @Slash</strong> on Discord';
    weapons.querySelector('.left').appendChild(weaponCredit);
    const mods = makeCollapsibleSection('Damage Modification Pipeline', '', buildModsSection);
    const modsCredit = el('span', { className: 'formulas-credit' });
    modsCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
    mods.querySelector('.left').appendChild(modsCredit);
    return group(base, weapons, mods);
  };

  const buildDamageTakenPage = () => {
    const guard = makeCollapsibleSection('Damage Taken Pipeline', '', buildGuardSection);
    const credit = el('span', { className: 'formulas-credit' });
    credit.innerHTML = 'Reverse engineered by <strong>@ohmi</strong> on Discord';
    guard.querySelector('.left').appendChild(credit);
    return group(guard);
  };

  const buildProgressionPage = () => {
    const exp = section('Experience Table', 'experience', buildExpTable);
    const credit = el('span', { className: 'formulas-credit' });
    credit.innerHTML = 'Reverse engineered by <strong>@wolffy</strong> and <strong>@ohmi</strong> on Discord';
    exp.querySelector('.left').appendChild(credit);
    return group(exp);
  };

  return createFormulaBrowser({
    notice: disclaimer,
    archived: true,
    initialParams: options.initialParams,
    setNavigate: options.setNavigate,
    pages: [
      {
        key: 'accuracy', label: 'Accuracy', kicker: 'Will the attack connect?',
        description: 'COT1 player accuracy, monster avoidability, and the physical and magical hit checks.',
        sections: [{ key: 'accuracy-formulas', label: 'Accuracy formulas' }], render: buildAccuracyPage,
      },
      {
        key: 'dealing-damage', label: 'Dealing Damage', kicker: 'From stats to the applied hit',
        description: 'Trace one archived outgoing hit from its base roll through defenses, elements, criticals, and the final clamp.',
        flow: buildDamageFlow,
        sections: [
          { key: 'base-damage', label: 'Base damage' }, { key: 'weapon-multipliers', label: 'Weapons' },
          { key: 'defense-elements', label: 'Defense & elements' },
          { key: 'hit-effects', label: 'Hit effects' }, { key: 'final-result', label: 'Final result' },
        ], render: buildDamagePage,
      },
      {
        key: 'damage-taken', label: 'Damage Taken', kicker: 'What happens when a monster attacks?',
        description: 'Follow the archived hit check, guard roll, defense scaling, reductions, and final incoming result.',
        sections: [
          { key: 'hit-check', label: 'Hit check' }, { key: 'guard-resolution', label: 'Guards' },
          { key: 'damage-reduction', label: 'Damage reduction' }, { key: 'incoming-result', label: 'Result' },
        ], render: buildDamageTakenPage,
      },
      {
        key: 'progression', label: 'Tables & Progression', kicker: 'Archived character milestones',
        description: 'Look up COT1 experience requirements. Crafting and citizenship tables were added in later versions.',
        sections: [{ key: 'experience', label: 'Experience' }], render: buildProgressionPage,
      },
    ],
  });
}
