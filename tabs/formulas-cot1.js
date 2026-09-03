import { el } from '../lib/utils.js';
import { buildCalcLauncher } from './formulas-calc.js';
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
  ['1H Sword',        1.8, 1.8, '—'],
  ['2H Sword',        2.5, 2.5, '—'],
  ['1H Blunt Weapon', 2.4, 1.2, '—'],
  ['2H Blunt Weapon', 3,   2,   '—'],
  ['1H Axe',          2.4, 1.2, '—'],
  ['2H Axe',          3,   2,   '—'],
  ['Spear',           1.5, 3.5, '—'],
  ['Polearm',         3.5, 1.5, '—'],
  ['Bow',             1.0, 1.0, 2.5],
  ['Crossbow',        1.0, 1.0, 2.5],
  ['Claw',            1.0, 1.0, 2.5],
  ['Dagger',          1,   2,   '—'],
  ['Wand',            1.8, 1.8, '—'],
  ['Staff',           1.8, 1.8, '—'],
  ['Barehanded',      1,   1,   '—'],
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
  ['Bow',                    '100%', '—'],
  ['Wand / Staff',           '100%', '—'],
  ['Claw',                   '—',   '100%'],
  ['Barehanded',             '—',   '100%'],
];

// ─── Accuracy ────────────────────────────────────────────────

// Derived from the COT1 client binary (C:\Users\brian\Downloads\Maplestory.exe,
// sha256 c4201971...). See tmp/accuracy-cot1-binary.md.
const ACCURACY_STEPS = [
  {
    label: 'Base Accuracy & Avoidability',
    wip: false,
    status: 'ok',
    statusNote: 'Read from the COT1 stat-seeding routine.',
    lines: [
      'Acc = Dex / 3 + Luk / 6 + 5',
      '',
      'Avoid = Luk / 3 + Dex / 6 + 5',
    ],
    notes: [
      'One formula for every class - there is no job dispatch and no level term.',
      'Every stat here is the total including equipment and buffs. Flat accuracy from items and buffs is added on top, and the result is clamped to 0-9999.',
      'The same routine seeds the base 5% critical rate and 20% critical damage.',
    ],
  },
  {
    label: 'Physical Accuracy',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the hit test inlined in the COT1 physical damage routine. The formula the community fitted during COT1 was exactly right.',
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
      'exp() is the exponential function',
      'The client also auto-hits when BaseChance − Avoid ≥ 25, a flat cutoff with no level term. A flag on the monster (likely the boss flag) disables the auto-hit.',
      'There is no forced-miss debuff roll and no always-hit skill property in COT1.',
    ],
  },
  {
    label: 'Magical Accuracy',
    wip: false,
    status: 'ok',
    statusNote: 'The COT1 magic damage routine contains no accuracy code at all - every exp() call site in the binary is accounted for, and none is reachable from the magic path.',
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
    statusNote: 'Read directly from the COT1 physical damage routine. The old "AttackPower counts once" belief came from the stat-window preview, which really does divide it by 100 - combat always counted it double.',
    // Shown by default. StatDiv 100 / AtkDiv 50 covers every attack except Prone Stab
    // and meleeing with a Bow, Crossbow or Claw, so folding them in recovers the plain
    // form. Nothing here is an approximation - it is the general form with the two rare
    // branches substituted.
    simple: {
      lines: [
        'StatRoll = rand(PrimaryStat × MasteryMult, PrimaryStat)',
        'BaseRoll = rand(80, 100)',
        '',
        'Damage = SkillMult × ((BaseRoll + StatRoll × WepMult + SecondaryStat + AttackPower × 2) / 100) × WeaponAttack',
        '',
        'MIN = SkillMult × ((80 + PrimaryStat × WepMult × MasteryMult + SecondaryStat + AttackPower × 2) / 100) × WeaponAttack',
        'MAX = SkillMult × ((100 + PrimaryStat × WepMult + SecondaryStat + AttackPower × 2) / 100) × WeaponAttack',
      ],
      notes: [
        'StatRoll and BaseRoll are two separate draws, so a hit can land low on one and high on the other. MIN and MAX are the corners of that rectangle, not the ends of a single roll',
        'WepMult is chosen by the attack action, not by the skill - see the Weapon Multipliers table. Lucky Seven forces a 2.6 weapon multiplier instead of the Claw\'s 2.5',
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
      'MIN = SkillMult × (0.8 + (PrimaryStat × WepMult × MasteryMult + SecondaryStat) / StatDiv + AttackPower / AtkDiv) × WeaponAttack',
      'MAX = SkillMult × (1.0 + (PrimaryStat × WepMult + SecondaryStat) / StatDiv + AttackPower / AtkDiv) × WeaponAttack',
      '',
      'Prone Stab    replaces 0.8 and 1.0 with 0.2 and 0.3, and forces WepMult = 1',
      'Lucky Seven   forces WepMult = 2.6 in place of the Claw Shoot 2.5',
    ],
    notes: [
      'Same two draws; the familiar form above is this with StatDiv 100 / AtkDiv 50 substituted',
      'With the usual StatDiv of 100 and AtkDiv of 50 this is the familiar (100 + PrimaryStat × WepMult + SecondaryStat + AttackPower × 2) / 100 × WeaponAttack',
      'WepMult is chosen by the attack action, not by the skill - see the Weapon Multipliers table',
      'AttackPower counts double in combat. The stat window preview divides it by 100 instead - that mismatch is what the community\'s "AttackPower × 1" fit was measuring',
      'Bows, Crossbows and Claws draw their firing animation from a separate ranged action list, so a normal shot lands on Shoot (2.5, StatDiv 100). The StatDiv 300 rows are what you get meleeing with them - a Claw with no stars left stabs for 1.0',
      'Lucky Seven forces a 2.6 weapon multiplier instead of the Claw\'s 2.5. The old claim that Drain and Normal Attack share the 2.6 has no support in the client',
    ],
  },
  {
    label: 'Magical Damage',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 magic damage routine. The community formula was exactly right, including the base-Int read - the bracket reads the raw character record, not the equipment-inclusive total.',
    lines: [
      'MIN = (BasicAttack + Magic / 7) × ((Magic × 2 × MasteryMult + BaseInt) / 100 + 1)',
      'MAX = (BasicAttack + Magic / 7) × ((Magic × 2 + BaseInt) / 100 + 1)',
    ],
    warnings: [
      'Magic here is the MAGIC stat on your stat window (Total Int / 2 plus gear Magic Attack plus buffs), not the Magic Attack total from your gear on its own.',
    ],
    notes: [
      'BaseInt really is base Int only - the client reads the raw character record, so Int from equipment and scrolls is skipped in the bracket (it still counts inside Magic)',
    ],
  },
  {
    label: 'Heal',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the two Heal implementations in the COT1 client - the only two places where the 200 and 3 constants co-occur.',
    lines: [
      'HealAmount = ((BaseInt × Roll + BaseLuk) / 200 + 3) × Magic × (RecoveryRate / 100) × (TargetsHit × 0.1 + 1)',
      '',
      'Roll = rand(0.8, 1.0)',
      '',
      'Damage = trunc(HealAmount) / TargetsHit × 0.5',
    ],
    notes: [
      'BaseInt and BaseLuk are base stats from AP only, matching the community fit',
      'TargetsHit counts party members in range (at least 1, at most 6, the caster included) plus undead enemies hit (up to 15)',
      'The damage side against undead is the heal divided by targets, halved',
    ],
  },
  {
    label: 'Damage Over Time (DoT)',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 damage-over-time routines. The Int divisor is 100.',
    lines: [
      'TotalDamage = (DoTBasicAttack + Magic / 7) × ((Magic + BaseInt) / 100 + 1)',
      '',
      'DamagePerTick = TotalDamage / DoTDurationSeconds',
    ],
    notes: [
      'DoT damage ignores all Defense reductions - the routine never reads the enemy\'s defenses',
      'The level difference penalty only ever uses its linear branch for DoT',
    ],
  },
  {
    label: 'Physical Damage Over Time (DoT)',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 physical DoT routine (0x1402aeca0), which calls the weapon-multiplier builder with action code 5. This variant is dead code in COT2 but live here.',
    lines: [
      'TotalDamage = (DoTBasicAttack / 100) × WeaponAttack × ((PrimaryStat × 2 + SecondaryStat) / 100 + AttackPower / 50 + 1)',
      '',
      'DamagePerTick = TotalDamage / DoTDurationSeconds',
    ],
    notes: [
      'Weapon-attack based, unlike the magic DoT above - PrimaryStat, SecondaryStat and WepMult come from the same weapon table as a normal physical hit',
      'DoT damage ignores all Defense reductions, uses only the linear branch of the level difference penalty, and its ticks can crit',
    ],
  },
];

const BASE_DAMAGE_VARS = [
  { name: 'SkillMult',     desc: 'Skill Damage % as a decimal (e.g. 120% → 1.2)' },
  { name: 'PrimaryStat',   desc: 'Set by weapon type:\nStr - Melee Weapons (1H/2H Swords, Axes, Blunt Weapons, Spears, Polearms, Barehands, and Staves/Wands while whacking)\nDex - Bows and Crossbows\nLuk - Daggers and Claws' },
  { name: 'SecondaryStat', desc: 'Set by weapon type:\nDex - Melee Weapons\nStr - Bows and Crossbows\nStr + Dex - Daggers and Claws' },
  { name: 'AttackPower',   desc: 'Attack from all gear other than the weapon and shield, plus buffs' },
  { name: 'WeaponAttack',  desc: 'Attack from the weapon and shield, plus Stars and Arrows' },
  { name: 'WepMult',       desc: 'Weapon multiplier for the attack action used - see Weapon Multipliers table' },
  { name: 'MasteryMult',   desc: '(0.1 + MasteryLevel / 10) × 0.8. Exception: Lucky Seven reads its own skill data instead, same mechanism as COT2' },
  { name: 'BasicAttack',   desc: 'Basic Attack damage value listed on the skill, for magic skills only' },
  { name: 'DoTBasicAttack', desc: 'The "deals N Basic Attack over X sec" value listed on the skill' },
  { name: 'Magic',              desc: 'The MAGIC value on the stat window, and the whole stat rather than the Magic Attack printed on your gear. The client builds it as TotalInt / 2, plus EquipmentMagicAttack, plus buff magic attack. It keeps only this one number, and every magic formula reads it' },
  { name: 'EquipmentMagicAttack', desc: 'Sum of Magic Attack on all gear (including above/below average and scrolled stats). Feeds into Magic; nothing reads it on its own' },
  { name: 'BaseInt',       desc: 'BASE Int from AP only - the client reads the raw character record here, skipping equipment' },
  { name: 'BaseLuk',       desc: 'BASE Luk from AP only - same raw-record read as BaseInt' },
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
    statusNote: 'Read directly from the COT1 physical damage routine and the enemy weapon-defense getter, percent and flat slots included.',
    lines: [
      'WeaponDefense = max(0, trunc(BaseWeaponDefense × (PercentEffects / 100 + 1)) + FlatEffects)',
      '',
      'Damage = Damage × 100 / (WeaponDefense + 100)',
    ],
    notes: [
      'trunc() rounds toward zero (down for positive, up for negative)',
      'Applies to Physical damage only',
      'This is the monster side only. The damage a player takes uses the same stat names but a completely different formula, see the Damage Taken section',
      'Percent and flat read slots 2 and 1 of the monster modifier table (7 slots of 48 bytes at mob+0x698)',
      'Crossbow Mastery rolls its listed Ignore Defense chance (Crossbowman jobs 320-322 only), once per attack; on a proc the whole defense step is skipped. This is the only Ignore Defense in COT1 - Blunt Weapon Mastery is a stun passive instead',
    ],
  },
  {
    label: 'Magic Defense',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 magic damage routine. Unlike the weapon side there is no percent/flat modifier pipeline - the raw stat feeds straight in.',
    lines: [
      'Damage = Damage × 100 / (MagicDefense + 100)',
    ],
    notes: [
      'Applies to Magical damage only',
      'The raw monster stat with no percent or flat modifier slots',
      'This is the monster side only. The damage a player takes uses the same stat names but a completely different formula - see the Damage Taken section',
      'There is no Ignore Defense proc on the magic side, and no equivalent of Armor Crash',
    ],
  },
  {
    label: 'Elemental Modifier',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the inline four-way switch in both COT1 damage routines.',
    lines: [
      'Damage = Damage × ElementalMult',
      '  0.0  - immune',
      '  0.75 - resistant',
      '  1.0  - neutral',
      '  1.25 - weak against element',
    ],
    notes: [
      'A four-value switch, nothing else. Anything outside the four resistance codes falls back to 1.0. The Element Composition skills and their two-element blend do not exist in COT1',
    ],
  },
  {
    label: 'Level Difference Penalty',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 client - the same code appears in the physical, magic and DoT routines.',
    lines: [
      'LevelDiff = EnemyLevel − PlayerLevel',
      '',
      'No penalty if LevelDiff ≤ 0',
      '  LevelDiff < 10:  Damage = Damage / (LevelDiff² × 0.005 + 1)',
      '  LevelDiff ≥ 10:  Damage = Damage / (LevelDiff × 0.05 + 1)',
    ],
    notes: [
      'The two branches meet exactly at LevelDiff 10, where the penalty term is 0.5 either way - the damage is divided by 1.5, so about a third of it is lost',
      'DoT only ever uses the linear branch',
    ],
  },
  {
    label: 'Critical Hit',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the crit roll in the COT1 physical, magic and damage-over-time routines.',
    lines: [
      'IsCrit = rand(0, 99) < CritRate',
      '',
      'Damage = Damage × (100 + CritDamage) / 100',
    ],
    notes: [
      'Always-crit is hard-coded for Power Knockback in both lines, Hunter 3101002 and Crossbowman 3201002 — both named Power Knockback in COT1 strings, adjacent in the damage routine.',
      'DoT ticks roll crit too, so a burn or a bleed tick can crit',
    ],
  },
  {
    label: 'Iron Arrow Falloff (Crossbow only)',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 client, hard-coded to Iron Arrow: Crossbow by skill ID.',
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
    statusNote: 'Established by absence: the skill IDs occur nowhere in the COT1 binary and no equivalent code paths exist in the damage routines.',
    lines: [
      'None of these exist in COT1.',
    ],
    notes: [
      'The COT1 damage pipeline has no orb multiplier, no charge multiplier, no defense-nullifying branch, no elemental amplification step and no second-half hit split',
    ],
  },
  {
    label: 'Clamp',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 client - the 700 billion cap appears as an integer immediate in every damage routine.',
    lines: [
      'Damage = trunc(Damage)',
      'Damage = clamp(Damage, 1, 700,000,000,000)',
    ],
    notes: [
      'The cap really is 700,000,000,000 - per-hit damage is stored as a 64-bit integer',
    ],
  },
];

const MOD_VARS = [
  { name: 'BaseWeaponDefense', desc: "Enemy's weapon defense stat, before modifiers" },
  { name: 'WeaponDefense',   desc: "Enemy's weapon defense after percent and flat modifiers, floored at 0" },
  { name: 'PercentEffects',  desc: 'A percentage modifier slot on the monster\'s weapon defense. Threaten (1201004) is flagged for it; Disorder (4001000) is not. Per-skill values unchecked — slot attribution unestablished' },
  { name: 'FlatEffects',     desc: 'A flat modifier slot the monster carries for its weapon defense, added after the percentage' },
  { name: 'MagicDefense',    desc: "Enemy's raw magic defense stat - no modifier slots in COT1" },
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
    statusNote: 'Read directly from the COT1 outcome-test routine (0x1402b4ee0), including the 0.11/0.26 spread and both salvage branches.',
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
      'Avoid is your Avoid stat from the Stats panel, before the diminishing-returns step',
      'Magic-flagged mob skills skip this check and all guard rolls (always hit). Cannot-miss skills skip this check but can still be guarded.',
      'Only regular attacks and non-magic mob skills go through this check - see the Result step',
    ],
  },
  {
    label: 'Guard Immunity',
    wip: false,
    status: 'partial',
    statusNote: 'The check is read directly from the COT1 client, but the monster flag it reads has not been matched to a property in the monster data.',
    lines: [
      'A flag on the monster can switch guard off entirely for its attacks.',
    ],
    notes: [
      'When that flag is set the attack always resolves as a normal hit and the guard roll below is never reached',
    ],
  },
  {
    label: 'Shield Guard',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 outcome-test routine, including the 500 divisor and the 5% floor.',
    lines: [
      'ShieldDefense = Weapon Defense on the item in the shield slot',
      '',
      'Only rolled if ShieldDefense > 0:',
      '  GuardChance = max(0.05, ShieldDefense / (ShieldDefense + 500))',
      '',
      'Guarded = GuardChance > rand(0, 1)',
    ],
    notes: [
      'Only the shield slot counts; a guard fully negates the hit',
      'Claw Guard does not exist in COT1 - shields are the only source of guards',
    ],
  },
  {
    label: 'Incoming Damage',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the two COT1 damage-taken routines and the monster attack-value getter.',
    lines: [
      'IncomingDamage = MonsterAttack × (1.1 + 0.4 × rand(0, 1))',
    ],
    notes: [
      "MonsterAttack is the monster's physical attack for a regular attack, plus its percent modifiers from slot 0 of the monster modifier table. For a skill attack it is the flat magic attack from the mob template, with no modifier slot",
      'The fixed-damage attack path exists only as an empty stub that returns 0',
    ],
  },
  {
    label: 'Player Defense',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from both COT1 damage-taken routines with every constant resolved. There is no level term anywhere in the computation.',
    lines: [
      'Defense = WeaponDefense for a regular attack, MagicDefense for a skill attack',
      '',
      'DamageTaken = IncomingDamage / (1 + Defense / (5 × IncomingDamage))',
    ],
    notes: [
      'The defense scale is just 5 × the hit itself - there is no level term anywhere in the computation',
      'Because the scale shrinks with the hit, defense crushes chip damage (small hits get pushed toward the 1-damage floor) but does comparatively little against big hits',
    ],
  },
  {
    label: 'Result',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the COT1 client.',
    lines: [
      'DamageTaken = clamp(DamageTaken, 1, 50000000), truncated',
      '',
      'DamageTaken = 0 if the hit missed or was guarded',
    ],
    notes: [
      'Guard is a full negation - the client computes the damage and throws it away',
      'Guard is only rolled for a monster\'s regular attack; magic-flagged monster skill attacks can neither miss nor be guarded',
    ],
  },
];

const GUARD_VARS = [
  { name: 'MonsterAcc', desc: "The monster's accuracy stat" },
  { name: 'MonsterLevel', desc: "The monster's level" },
  { name: 'LevelGap', desc: "Your level minus the monster's level, or 0 if the monster is the higher level" },
  { name: 'Avoid', desc: 'Your Avoid stat from the Stats panel, before the diminishing-returns step' },
  { name: 'HitRate', desc: "The monster's accuracy scaled against the level gap - what the roll is measured against" },
  { name: 'AvoidRate', desc: 'Your Avoid after diminishing returns and the level-gap term' },
  { name: 'ShieldDefense', desc: 'Weapon Defense of the item equipped in the shield slot, scrolls included. Nothing else feeds this value' },
  { name: 'GuardChance',   desc: 'Chance for the hit to be negated outright' },
  { name: 'MonsterAttack', desc: "The monster's physical attack for a regular attack, or its magic attack for a skill attack, after its own percent modifiers" },
  { name: 'IncomingDamage', desc: 'The rolled damage of the hit, before the player\'s defense is applied' },
  { name: 'Defense',       desc: "The player's Weapon Defense against a regular attack, or Magic Defense against a skill attack, from the Stats panel" },
  { name: 'DamageTaken',   desc: 'HP actually lost from the hit' },
];


// ─── Formula tokenizer ───────────────────────────────────────

const FORMULA_FNS = new Set(['exp', 'rand', 'trunc', 'floor', 'clamp', 'max']);
const FORMULA_TOKEN_RE = /([A-Za-z][A-Za-z0-9]*)|(\d+(?:\.\d+)?)/g;

function tokenizeLine(line) {
  let out = '';
  let last = 0;
  let m;
  FORMULA_TOKEN_RE.lastIndex = 0;
  while ((m = FORMULA_TOKEN_RE.exec(line)) !== null) {
    out += line.slice(last, m.index);
    if (m[1]) {
      const cls = FORMULA_FNS.has(m[1]) ? 'formula-fn' : 'formula-var';
      out += `<span class="${cls}">${m[1]}</span>`;
    } else {
      out += `<span class="formula-num">${m[0]}</span>`;
    }
    last = FORMULA_TOKEN_RE.lastIndex;
  }
  out += line.slice(last);
  return out;
}

// ─── Status tooltip ───────────────────────────────────────────

let _statusTip = null;
function getStatusTip() {
  if (!_statusTip) {
    _statusTip = document.createElement('div');
    _statusTip.className = 'formula-status-tooltip';
    document.body.appendChild(_statusTip);
  }
  return _statusTip;
}

function showStatusTooltip(anchor, text) {
  const tip = getStatusTip();
  tip.textContent = text;
  tip.style.visibility = 'hidden';
  tip.classList.add('visible');

  const rect = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let x = rect.left + rect.width / 2 - tw / 2 + window.scrollX;
  let y = rect.top - th - 6 + window.scrollY;
  x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
  if (y < window.scrollY + 8) y = rect.bottom + 6 + window.scrollY;

  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.style.visibility = '';
}

function hideStatusTooltip() {
  _statusTip?.classList.remove('visible');
}

function attachTooltip(tag, text) {
  if (!text) return tag;
  tag.addEventListener('mouseenter', () => showStatusTooltip(tag, text));
  tag.addEventListener('mouseleave', hideStatusTooltip);
  return tag;
}

// ─── Shared helpers ───────────────────────────────────────────

function makeCollapsibleSection(title, countLabel, bodyFn) {
  const wrap = el('div', { className: 'collapsible open' });

  const header = el('div', { className: 'collapsible-header' });
  const left = el('div', { className: 'left' });
  left.appendChild(el('span', { className: 'title', textContent: title }));
  const right = el('div', { className: 'right' });
  if (countLabel) right.appendChild(el('span', { className: 'count', textContent: countLabel }));

  header.appendChild(left);
  header.appendChild(right);

  const body = el('div', { className: 'collapsible-body' });
  body.appendChild(bodyFn());

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

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
        statusTag.addEventListener('mouseenter', () => showStatusTooltip(statusTag, tooltipText));
        statusTag.addEventListener('mouseleave', hideStatusTooltip);
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
      attachTooltip(toggle, 'Off, this shows the formula for the cases that actually come up. On, it adds the two branches that only fire for Prone Stab and for meleeing with a Bow, Crossbow or Claw - the exact form the client implements.');
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

function buildVarLegend(vars) {
  const wrap = el('div', { className: 'formulas-var-section' });
  wrap.appendChild(el('div', { className: 'formulas-var-heading', textContent: 'Variables' }));
  const grid = el('div', { className: 'formulas-var-grid' });
  vars.forEach(({ name, desc }) => {
    const row = el('div', { className: 'formulas-var-row' });
    row.appendChild(el('span', { className: 'formulas-var-name', textContent: name }));
    row.appendChild(el('span', { className: 'formulas-var-desc', textContent: desc }));
    grid.appendChild(row);
  });
  wrap.appendChild(grid);
  return wrap;
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

function buildTable(headers, rows) {
  const table = el('table', { className: 'data-table' });

  const thead = el('thead');
  const headerRow = el('tr');
  headers.forEach(([text, cls]) => headerRow.appendChild(el('th', { className: cls, textContent: text })));
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  rows.forEach((cells) => {
    const row = el('tr');
    cells.forEach((v, i) => row.appendChild(el('td', { className: headers[i][1], textContent: v })));
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  return table;
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

  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The multiplier is picked by the attack animation, not the skill. Swing and Stab are the normal melee actions, and Shoot covers bow, crossbow and claw attacks. There is no Other column here - the COT1 classifier never returns it.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The Swing/Stab ratio above is the melee animation list, read from the same tables COT2 uses. Bows, Crossbows and Claws normally fire instead, drawing from a separate ranged list that always resolves to Shoot. Their Swing and Stab columns are only reached when meleeing without ammo.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: '* Bow, Crossbow and Claw melee values: a normal shot lands on Shoot (2.5) - the 1.0 rows are what you get meleeing with them, with the stat terms divided by 300 (see Advanced under Physical Damage).' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Most skills roll swing/stab like a plain attack. The groups below never roll: Stab and Shoot use the shown multiplier; the last group takes the weapon default (Swing: axes/blunts/polearms; Stab: daggers/spears; Shoot: bow/xbow/claw — other weapons roll, all columns equal). 3101005 is live skill data with no String entry. Magic skills never use a weapon multiplier.' }));

  const exceptions = el('div', { className: 'formulas-exceptions' });
  ACTION_EXCEPTIONS.forEach(([column, skills]) => {
    exceptions.appendChild(el('span', { className: 'formulas-exc-label', textContent: column }));
    exceptions.appendChild(el('span', { className: 'formulas-exc-skills', textContent: skills.length ? skills.join(', ') : '' }));
  });
  container.appendChild(exceptions);

  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Weapon types 34-36 are unused - their multiplier is 0, so damage zeroes out.' }));

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
    7: { key: 'final-result', label: 'Final Result', description: 'The client’s final lower bound before the hit is applied.' },
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
    'Assumes the attack lands. A miss deals 0, and the accuracy roll is not modelled here',
    magic
      ? 'Monster skill attacks cannot miss or be guarded, and they read your Magic Defense'
      : 'Regular attacks read your Weapon Defense and can be missed or guarded',
    'Your level does not appear anywhere in the COT1 defense step, so there is no level input',
  ],
};

function buildGuardSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(GUARD_STEPS, {
    0: { key: 'hit-check', label: 'Hit Check', description: 'Whether an ordinary monster attack reaches the player.' },
    1: { key: 'guard-resolution', label: 'Guard Resolution', description: 'Immunity and shield guard checks.' },
    3: { key: 'damage-reduction', label: 'Damage Reduction', description: 'Incoming roll, player defense, and additional reductions.' },
    5: { key: 'incoming-result', label: 'Result', description: 'The final outcome returned by the incoming-hit routine.' },
  }));
  if (CALC_MONSTERS.length) container.appendChild(buildCalcLauncher(CALC_CONFIG));
  container.appendChild(buildVarLegend(GUARD_VARS));
  return container;
}



// ─── Page render ──────────────────────────────────────────────

function renderFormulasCot1Legacy(data) {
  // Sorted by level so the picker reads top-down like the Monsters tab does.
  CALC_MONSTERS = [...(data?.monsters?.monsters ?? [])]
    .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  const frag = document.createDocumentFragment();
  const wrapper = el('div', { className: 'formulas-page' });

  wrapper.appendChild(el('div', { className: 'section-heading', textContent: 'Formulas & Tables' }));

  const disclaimer = el('div', { className: 'formulas-disclaimer' });
  const disclaimerText = el('span');
  disclaimerText.appendChild(el('strong', { textContent: 'Archived: ' }));
  disclaimerText.append('Formulas as they stood in Closed Online Test 1, read directly out of the COT1 client binary. See the current Formulas tab for the live game.');
  disclaimer.appendChild(disclaimerText);
  wrapper.appendChild(disclaimer);

  // Full-width formula sections
  const fullWidth = el('div', { className: 'formulas-full' });

  const accuracySection = makeCollapsibleSection('Accuracy', '', buildAccuracySection);
  const accCredit = el('span', { className: 'formulas-credit' });
  accCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
  accuracySection.querySelector('.left').appendChild(accCredit);

  const baseDmgSection = makeCollapsibleSection('Base Damage Formulas', '', buildBaseDamageSection);
  const dmgCredit = el('span', { className: 'formulas-credit' });
  dmgCredit.innerHTML = 'Reverse engineered by <strong>@Slash, @kirbypickr, @sublimerealist, @jimmybald</strong> on Discord';
  baseDmgSection.querySelector('.left').appendChild(dmgCredit);

  const modsSection = makeCollapsibleSection('Damage Modifications', '', buildModsSection);
  const modsCredit = el('span', { className: 'formulas-credit' });
  modsCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
  modsSection.querySelector('.left').appendChild(modsCredit);

  const guardSection = makeCollapsibleSection('Damage Taken', '', buildGuardSection);
  const guardCredit = el('span', { className: 'formulas-credit' });
  guardCredit.innerHTML = 'Reverse engineered by <strong>@ohmi</strong> on Discord';
  guardSection.querySelector('.left').appendChild(guardCredit);

  fullWidth.appendChild(accuracySection);
  fullWidth.appendChild(baseDmgSection);
  fullWidth.appendChild(modsSection);
  fullWidth.appendChild(guardSection);
  wrapper.appendChild(fullWidth);

  // Appendix
  wrapper.appendChild(el('div', { className: 'section-heading', textContent: 'Appendix' }));

  const appendix = el('div', { className: 'formulas-full' });

  const expSection = makeCollapsibleSection('Experience Table', '', buildExpTable);
  const expCredit = el('span', { className: 'formulas-credit' });
  expCredit.innerHTML = 'Reverse engineered by <strong>@wolffy</strong> on Discord';
  expSection.querySelector('.left').appendChild(expCredit);

  const weaponMultSection = makeCollapsibleSection('Weapon Min/Max Multipliers', '', buildWeaponMultTable);
  const weaponMultCredit = el('span', { className: 'formulas-credit' });
  weaponMultCredit.innerHTML = 'Reverse engineered by <strong>@kirbypickr, @Slash</strong> on Discord';
  weaponMultSection.querySelector('.left').appendChild(weaponMultCredit);

  appendix.appendChild(weaponMultSection);
  appendix.appendChild(expSection);
  wrapper.appendChild(appendix);

  frag.appendChild(wrapper);
  return frag;
}

export function renderFormulasCot1(data, options = {}) {
  CALC_MONSTERS = [...(data?.monsters?.monsters ?? [])]
    .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  const disclaimer = el('div', { className: 'formulas-disclaimer' });
  const disclaimerText = el('span');
  disclaimerText.appendChild(el('strong', { textContent: 'Archived: ' }));
  disclaimerText.append('Formulas as they stood in Closed Online Test 1, read directly out of the COT1 client binary. See the current Formulas tab for the live game.');
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
        description: 'Look up COT1 experience requirements. Later crafting and citizenship tables are not part of this snapshot.',
        sections: [{ key: 'experience', label: 'Experience' }], render: buildProgressionPage,
      },
    ],
  });
}
