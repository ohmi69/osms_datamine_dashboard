import { el } from '../lib/utils.js';
import { buildCalcLauncher } from './formulas-calc.js';

// Experience required per level, read out of the COT2 client. The client builds the
// table at startup in sub_14003B220 and reads it back through GetNeedEXP
// (sub_14087F690); see tmp/exp-table-binary.md.
const EXP_TABLE = [
  [1, 2, 15], [2, 3, 34], [3, 4, 57], [4, 5, 92],
  [5, 6, 135], [6, 7, 372], [7, 8, 560], [8, 9, 840],
  [9, 10, 1242], [10, 11, 1716], [11, 12, 2360], [12, 13, 3216],
  [13, 14, 4200], [14, 15, 5460], [15, 16, 7050], [16, 17, 8840],
  [17, 18, 11040], [18, 19, 13716], [19, 20, 16680], [20, 21, 20216],
  [21, 22, 24402], [22, 23, 28980], [23, 24, 34320], [24, 25, 40512],
  [25, 26, 47216], [26, 27, 54900], [27, 28, 63666], [28, 29, 73080],
  [29, 30, 83720], [30, 31, 95700], [31, 32, 108480], [32, 33, 122760],
  [33, 34, 138666], [34, 35, 155540], [35, 36, 174216], [36, 37, 194832],
  [37, 38, 216600], [38, 39, 240500], [39, 40, 266682], [40, 41, 294216],
  [41, 42, 324240], [42, 43, 356916], [43, 44, 391160], [44, 45, 428280],
  [45, 46, 468450], [46, 47, 510420], [47, 48, 555680], [48, 49, 604416],
  [49, 50, 655200], [50, 51, 709716], [51, 52, 748608], [52, 53, 789631],
  [53, 54, 832902], [54, 55, 878545], [55, 56, 926689], [56, 57, 977471],
  [57, 58, 1031036], [58, 59, 1087536], [59, 60, 1147132], [60, 61, 1209994],
  [61, 62, 1276301], [62, 63, 1346242], [63, 64, 1420016], [64, 65, 1497832],
  [65, 66, 1579913], [66, 67, 1666492], [67, 68, 1757815], [68, 69, 1854143],
  [69, 70, 1955750], [70, 71, 2062925], [71, 72, 2175973], [72, 73, 2295216],
  [73, 74, 2420993], [74, 75, 2553663], [75, 76, 2693603], [76, 77, 2841212],
  [77, 78, 2996910], [78, 79, 3161140], [79, 80, 3334370], [80, 81, 3517093],
  [81, 82, 3709829], [82, 83, 3913127], [83, 84, 4127566], [84, 85, 4353756],
  [85, 86, 4592341], [86, 87, 4844001], [87, 88, 5109452], [88, 89, 5389449],
  [89, 90, 5684790], [90, 91, 5996316], [91, 92, 6324914], [92, 93, 6671519],
  [93, 94, 7037118], [94, 95, 7422752], [95, 96, 7829518], [96, 97, 8258575],
  [97, 98, 8711144], [98, 99, 9188514], [99, 100, 9692044], [100, 101, 10223168],
  [101, 102, 10783397], [102, 103, 11374327], [103, 104, 11997640], [104, 105, 12655110],
  [105, 106, 13348610], [106, 107, 14080113], [107, 108, 14851703], [108, 109, 15665576],
  [109, 110, 16524049], [110, 111, 17429566], [111, 112, 18384706], [112, 113, 19392187],
  [113, 114, 20454878], [114, 115, 21575805], [115, 116, 22758159], [116, 117, 24005306],
  [117, 118, 25320796], [118, 119, 26708375], [119, 120, 28171993],
];

// Citizenship (Residency) grade thresholds, read out of the COT2 client. The
// contribution column is NeedContribution (sub_1402C9850) and the level column is
// NeedLevel (sub_1402C9830); the Citizenship tab (sub_1411AB6B0) is the only caller of
// either. Grade, contribution required, character level required.
// See tmp/citizenship-grade-binary.md.
const CITIZENSHIP_GRADES = [
  [1, 0, 12], [2, 1000, 17], [3, 2000, 22], [4, 3000, 27], [5, 4000, 32],
  [6, 5000, 37], [7, 6000, 42], [8, 7000, 47], [9, 8000, 52], [10, 10000, 57],
];

// Craft level, craft exp needed to finish that level, character level needed to move on
// to it. The exp column is GetCraftNeedEXP (sub_1401D2690), which takes only a level, so
// every discipline shares it; the character level column is the 5 x nextLevel the
// crafting window prints in its own tooltip (sub_1410F6F80). Level 1 comes from the
// quest, so it has no character level of its own.
// See tmp/crafting-exp-table-binary.md.
const CRAFT_LEVELS = [
  [1, 50, null], [2, 166, 10], [3, 319, 15], [4, 521, 20], [5, 787, 25],
  [6, 1138, 30], [7, 1602, 35], [8, 2214, 40], [9, 3022, 45], [10, 4089, 50],
];

const CRAFT_RULES = [
  ['Level 1', 'CraftExp = 50'],
  ['Level 2 to 10', 'CraftExp = trunc(PreviousLevelExp × 1.32) + 100'],
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
  ['Dagger*',         1,   2,   '-', 1.5],
  ['Wand',            1.8, 1.8, '-', 1.8],
  ['Staff',           1.8, 1.8, '-', 1.8],
  ['Barehanded',      1,   1,   1,   1  ],
];

// How the client picks a basic attack's animation: a uniform draw from the list the
// weapon owns (GetAttackAction sub_1407E5650, list table 0x143A4D6D0, keyed by the
// weapon's info/attack). The odds are just the make-up of that list - three swings and
// two stabs gives 60/40. See tmp/swing-stab-ratio-binary.md.
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

// The skills that carry their own action[] list in the client data and so never roll.
// Grouped by the multiplier column their animation resolves to. Savage Blow and Avenger
// use custom animations but are still hand-patched into the melee groups by the action
// classifier (sub_14025E1F0 compares the action id against 47 and 48 directly), so they
// do not fall to Other. See tmp/savage-blow-weapon-multiplier-binary.md.
const ACTION_EXCEPTIONS = [
  ['Stab', ['Double Stab', 'Savage Blow']],
  ['Swing', ['Three Snails', 'Energy Bolt', 'Magic Claw', 'Poison Breath', 'Cold Beam', 'Thunder Bolt', 'Shadow Web', 'Dragon Fury']],
  ['Shoot', ['Avenger']],
  ['Other', ['Rush', 'Assaulter', 'Meso Explosion', 'Piercing Crusher', 'Wind Step', 'Evasion Step']],
];

// ─── Accuracy ────────────────────────────────────────────────

// Read directly from the hit-test routine in MapleStory.exe. Physical and magic
// share one hit-test routine. Skills whose additional_process list contains 128
// skip it entirely - that is 9 debuff skills, no attack skills.
const ACCURACY_STEPS = [
  {
    label: 'Base Accuracy & Avoidability',
    wip: false,
    status: 'ok',
    statusNote: 'Read from the stat-seeding routine in the client. All five class branches and their constants confirmed; the magician branch reads INT where every other class reads DEX',
    lines: [
      'Common = Dex × 1.2 + Level × 2 + Luk × 0.6',
      '',
      'Beginner: Acc = Common / 2.5 + 5',
      'Warrior: Acc = Common / 2.5 + 10',
      'Magician: Acc = (Int × 1.2 + Level × 2 + Luk × 0.6) / 5.1 + 20',
      'Bowman: Acc = Common / 4.8 + 20',
      'Thief: Acc = Common / 4 + 15',
      '',
      'Avoid = Luk / 3 + Dex / 6 + 5',
    ],
    notes: [
      'Every stat here is the total including equipment and buffs, not the base value.',
      'Results are truncated to whole numbers.',
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
    status: 'ok',
    statusNote: 'Read directly from the hit-test routine in the client.',
    lines: [
      'BaseChance = Acc × 100 / ((max(0, LevelDiff) × 2 + 51) × 5)',
      '',
      'Spread = 0.15 + 0.2 / (1 + exp((BaseChance − Avoid) / 12))',
      '',
      'Roll = rand(1 − Spread, 1 + Spread)',
      '',
      'DidHit = Roll × BaseChance ≥ Avoid',
    ],
    notes: [
      'exp() is the exponential function',
      'Nine monster debuffs skip the check and always land, using their own success rate instead: Armor Crash, Threaten, Elemental Crash, Power Crash, Doom, and both versions of Slow and Seal. No attack skill is exempt.',
      'The client also auto-hits when BaseChance − Avoid ≥ 25 + LevelDiff × (Level / 2 + 15), but that needs Avoid above roughly 120 and the highest on any live mob is 64 (Gatekeeper), so it never decides a hit.',
      'A separate miss-chance debuff is rolled after a successful hit and can still turn it into a miss.',
    ],
    cot1: {
      notes: [
        'In COT1 magic skipped the hit test entirely and always hit. The shared physical/magic check is new.',
        'COT1\'s denominator was (LevelDiff + 51) × 5 - the ×2 on the level difference doubled the out-levelling penalty.',
        'COT1\'s spread was 0.05 + 0.3 / (1 + exp(...)): a tighter band at high accuracy, so capping hit chance was cheaper.',
        'COT1\'s auto-hit cutoff was a flat 25 with no level term, and the forced-miss debuff roll did not exist.',
      ],
    },
  },
];

const ACCURACY_VARS = [
  { name: 'Acc',       desc: "Player's Accuracy stat value (one stat - used for both physical and magic)" },
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
    status: 'ok',
    statusNote: 'Derived from the client binary.',
    lines: [
      'MIN = SkillMult × ((80 + PrimaryStat × WepMult × MasteryMult + SecondaryStat + AttackPower × 2) / 100) × WeaponAttack',
      'MAX = SkillMult × ((100 + PrimaryStat × WepMult + SecondaryStat + AttackPower × 2) / 100) × WeaponAttack',
    ],
    notes: [
      'The 80/100 term and the MasteryMult term are rolled independently, so a hit can land at the low end of one and the high end of the other - MIN and MAX are the corners of the range, not a single roll',
      'WepMult is a single value chosen by the attack action - see the Weapon Multipliers table',
      'Lucky Seven uses a 3.0 multi instead of the Claw\'s 2.5.',
      'Lucky Seven is the only skill in the client that gets a special weapon multiplier',
      'Combo Attack and the Elemental Charge both raise the Skill Damage % before anything else happens - see the Damage Modifications section',
      'Melee/stab with a Bow, Crossbow or Claw divides PrimaryStat and SecondaryStat by 300 instead of 100; swing also divides AttackPower by 150 instead of 50',
      'Prone Stab uses 20/30 in place of 80/100 and the same /300 and /150 divisors, and forces WepMult to 1',
    ],
    cot1: {
      notes: [
        'Only Lucky Seven changed: COT1 forced a 2.6 weapon multiplier, raised to 3.0 in COT2.',
      ],
    },
  },
  {
    label: 'Magical Damage',
    wip: false,
    status: 'ok',
    statusNote: 'Derived from the client binary.',
    lines: [
      'MIN = (BasicAttack / 100) × MagicAttack × (TotalInt × MasteryMult / 100 + 1)',
      'MAX = (BasicAttack / 100) × MagicAttack × (TotalInt / 100 + 1)',
    ],
    notes: [
      'The roll between MIN and MAX is a single uniform random per hit',
    ],
    cot1: {
      notes: [
        'Rewritten since COT1, which used (BasicAttack + MagicAttack / 7) × ((MagicAttack × 2 × MasteryMult + BaseInt) / 100 + 1) - and read base Int only, so Int from equipment did not count in the bracket.',
      ],
    },
  },
  {
    label: 'Heal',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the Heal branch of the magic damage routine in the client.',
    lines: [
      'HealAmount = ((TotalInt × Roll + TotalLuk) / 200 + 3) × MagicAttack × (RecoveryRate / 100) × (TargetsHit × 0.1 + 1)',
      '',
      'Roll = rand(0.8, 1.0)',
      '',
      'HealAmount = HealAmount × (HealBonus / 100 + 1)',
      '',
      'Damage = HealAmount / TargetsHit × 0.5',
    ],
    notes: [
      'RecoveryRate is the recovery rate listed on the skill itself.',
      'TargetsHit is everyone the cast reaches - monsters, up to 15 of them, plus party members, up to 6. The party side counts at least 1, since the caster is always in range of their own Heal.',
      'HealBonus is a percentage buff slot that the client applies only to Heal, and no skill or item in the game is known to set it. It is applied before the split, so it raises the healing and the damage together.',
    ],
    cot1: {
      notes: [
        'Same shape as COT1, but COT1 read base Int and base Luk from AP only - the switch to totals including equipment is new.',
      ],
    },
  },
  {
    label: 'Damage Over Time (DoT)',
    wip: false,
    status: 'partial',
    statusNote: 'The total is read directly from the damage-over-time routine in the client. The split into per-tick damage is not: the client computes the total and never divides it, so that line comes from the skill descriptions, which say the listed value is the total dealt over the duration.',
    lines: [
      'TotalDamage = (DoTBasicAttack / 100) × MagicAttack × (TotalInt / 125 + 1)',
      '',
      'DamagePerTick = TotalDamage / DoTDurationSeconds',
    ],
    notes: [
      'DoT damage ignores all Defense reductions - the routine never reads the enemy\'s weapon or magic defense at all',
      'Note the divisor is 125, not the 100 used everywhere else',
      'Every DoT skill in the game currently ticks once per second, so ticks and seconds are interchangeable here',
      'The Elemental Modifier, the Level Difference Penalty and the Critical Hit roll all apply to DoT, but DoT only ever uses the linear branch of the level penalty - see those steps',
    ],
    cot1: {
      notes: [
        'Rewritten since COT1, which used (DoTBasicAttack + MagicAttack / 7) × ((MagicAttack + BaseInt) / 100 + 1) with base Int and a divisor of 100 - the 125 divisor is new.',
      ],
    },
  },
];

const BASE_DAMAGE_VARS = [
  { name: 'SkillMult',     desc: 'Skill Damage % as a decimal (e.g. 120% → 1.2)' },
  { name: 'PrimaryStat',   desc: 'Set by weapon type:\nStr - Melee Weapons (1H/2H Swords, Axes, Blunt Weapons, Spears, Polearms, Barehands, and Staves/Wands while whacking)\nDex - Bows and Crossbows\nLuk - Daggers and Claws' },
  { name: 'SecondaryStat', desc: 'Set by weapon type:\nDex - Melee Weapons\nStr - Bows and Crossbows\nStr + Dex - Daggers and Claws' },
  { name: 'AttackPower',   desc: 'Attack from all gear other than the weapon and shield, plus buffs' },
  { name: 'WeaponAttack',  desc: 'Attack from the weapon and shield (5 if barehanded), plus Stars and Arrows' },
  { name: 'WepMult',       desc: 'Weapon multiplier for the attack action used - see Weapon Multipliers table' },
  { name: 'MasteryMult',   desc: '(0.1 + MasteryLevel / 10) × 0.8, where MasteryLevel runs 1 to 10. Physical attacks read MasteryLevel from the weapon mastery skill for the equipped weapon; magic attacks read it from the attacking skill\'s own data instead, so a weapon mastery skill never affects magic. Exception: Lucky Seven ignores mastery skills entirely and takes its multiplier straight from its own skill data, which is 0.5 at every level - the same as a MasteryLevel of 5.25' },
  { name: 'BasicAttack',   desc: 'Basic Attack value listed on the skill, for magic skills only' },
  { name: 'DoTBasicAttack', desc: 'The "deals N Basic Attack over X sec" value listed on the skill' },
  { name: 'MagicAttack',        desc: 'TotalInt / 2 + EquipmentMagicAttack (MAGIC value shown in UI)' },
  { name: 'EquipmentMagicAttack', desc: 'Sum of Magic Attack on all gear (including above/below average and scrolled stats)' },
  { name: 'TotalInt',      desc: 'Total Int, including Equipment and Scrolls' },
  { name: 'TotalLuk',      desc: 'Total Luk, including Equipment and Scrolls' },
  { name: 'RecoveryRate',  desc: 'Heal skill recovery rate %' },
  { name: 'TargetsHit',    desc: 'Total targets hit: enemies (max 15) + caster + allies in range (max 6 including the caster)' },
  { name: 'HealBonus',     desc: 'Percentage bonus the client applies to Heal only. Supported by the client, but no skill or item in the game is known to set it' },
  { name: 'DoTDurationSeconds', desc: 'Duration of the DoT effect in seconds' },
];

// ─── Damage Modifications ─────────────────────────────────────

const MOD_PIPELINE_STEPS = [
  {
    label: 'Combo Attack (Crusader)',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the physical damage routine and the combo multiplier function it calls, including the job check and the two Panic/Coma skill IDs.',
    lines: [
      'ComboBonus = 5 × Orbs × (Orbs − 1)   for Panic and Coma',
      'ComboBonus = ComboDamage             for every other skill',
      '',
      'SkillMult = SkillMult × (ComboBonus / 100 + 1)',
    ],
    notes: [
      'Only applies while Combo Attack is active and at least one orb is stacked',
      'ComboDamage is Combo Attack\'s own damage bonus, 5% at level 1 rising to 20% at level 30',
      'Panic and Coma ignore that value and scale off the orb count instead. ComboBonus is a percentage, so at 1 to 5 orbs it is 0, 10, 30, 60 and 100 - a multiplier of ×1.0, ×1.1, ×1.3, ×1.6 and ×2.0',
      'This lands on the Skill Damage % before the base damage formula runs, so it multiplies the whole hit',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Combo Attack does not exist in COT1 - neither the skill nor the orb multiplier code path.',
      ],
    },
  },
  {
    label: 'Elemental Charge (White Knight)',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the physical damage routine, including the job check and the read of the active charge skill\'s own damage value.',
    lines: [
      'SkillMult = SkillMult × (ChargeDamage / 100 + 1)',
    ],
    notes: [
      'Only applies while a charge is active',
      'ChargeDamage is the charge skill\'s own value, 2% at level 1 rising to 20% at level 30. Fire, Ice and Lightning Charge all use the same numbers',
      'Like Combo Attack, this lands on the Skill Damage % before the base damage formula runs',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'The charge skills and this multiplier do not exist in COT1.',
      ],
    },
  },
  {
    label: 'Defense Nullified (Armor Crash)',
    wip: false,
    status: 'partial',
    statusNote: 'The branch is read directly from the client: the weapon-defense getter returns 0 outright when a flag on the monster is set, before any modifier is read. Tying that flag to Armor Crash is inference - the flag is set by the server, and Armor Crash is the only skill in the game data described as zeroing physical defense.',
    lines: [
      'If the monster is flagged, WeaponDefense = 0 and the step below is skipped entirely.',
    ],
    notes: [
      'Armor Crash reduces a monster\'s Physical Defense to 0 rather than reducing it by a percentage, so it does not go through the modifier slots at all',
      'Physical only. The magic-defense getter has no equivalent branch, matching the skill description',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Neither the skill nor the branch exists in COT1 - Armor Crash\'s ID appears nowhere in that binary, and the defense build has no such check.',
      ],
    },
  },
  {
    label: 'Weapon Defense',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the physical damage routine and the enemy weapon-defense getter in the client, with both constants resolved.',
    lines: [
      'WeaponDefense = max(0, trunc(BaseWeaponDefense × (PercentEffects / 100 + 1)) + FlatEffects)',
      '',
      'Damage = Damage × 100 / (WeaponDefense + 100)',
    ],
    notes: [
      'trunc() rounds toward zero (down for positive, up for negative)',
      'Applies to Physical damage only',
      'This is the monster side only. The damage a player takes uses the same stat names but a completely different formula, see the Damage Taken section',
      'PercentEffects and FlatEffects are two separate modifier slots the monster carries. Threaten and Disorder are the two skills that lower a monster\'s Weapon Def',
      'Blunt Weapon Mastery and Crossbow Mastery both roll their listed Ignore Defense chance. On a proc, WeaponDefense is forced to 0, which makes this step ×1',
      'That roll happens once for the whole attack, not once per hit. On a multi-hit skill every hit ignores defense or none of them does - you never get a mix within one attack',
    ],
    cot1: {
      notes: [
        'The formula is unchanged from COT1. What changed is the procs: COT1 only had the Crossbow Mastery Ignore Defense - the Blunt Weapon Mastery proc is new (in COT1 that skill was a stun passive).',
      ],
    },
  },
  {
    label: 'Magic Defense',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the magic damage routine and the enemy magic-defense getter in the client.',
    lines: [
      'MagicDefense = max(0, trunc(BaseMagicDefense × (PercentEffects / 100 + 1)) + FlatEffects)',
      '',
      'Damage = Damage × 100 / (MagicDefense + 100)',
    ],
    notes: [
      'Applies to Magical damage only',
      'Identical in shape to Weapon Defense, reading its own pair of percent and flat modifier slots on the enemy',
      'This is the monster side only. The damage a player takes uses the same stat names but a completely different formula - see the Damage Taken section',
      'No skill in the game reduces a monster\'s Magic Def - every defense debuff in the data names Weapon Def. So the client supports these two slots, but nothing is currently known to fill them, and this step is in practice just the monster\'s printed Magic Def',
      'There is no Ignore Defense proc on the magic side, and no equivalent of Armor Crash',
    ],
    cot1: {
      notes: [
        'COT1 fed the raw monster stat straight in - its magic-defense getter is a two-instruction field read with no percent or flat lookup at all, so no debuff could ever lower the Magic Def your spells are divided by. The slots on the magic side are new, even though nothing fills them yet.',
      ],
    },
  },
  {
    label: 'Elemental Modifier',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the elemental multiplier table and the two-element blend table in the client, cross-checked against the monster resistance codes and the skill elements in the game data.',
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
      'Only two skills carry two elements: both versions of Element Composition, which blends Fire with Poison for the Fire/Poison line and Ice with Lightning for the Ice/Lightning line',
      'The two-element rule is what produces the 0.25, 0.5 and 1.5 multipliers, which a single-element attack can never reach. Element Composition against a monster weak to both of its elements gives 1.5, and against one immune to both it gives 0.0. The skill description says the same thing, that damage increases up to 1.5 times when the enemy is weak to both elements',
      'Anything outside this table falls back to 1.0',
    ],
    cot1: {
      notes: [
        'COT1 had only the four single-element values (0, 0.75, 1.0, 1.25). The two-element blend, the 0.25/0.5/1.5 multipliers and Element Composition itself are all new.',
      ],
    },
  },
  {
    label: 'Level Difference Penalty',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the client - the same code appears in the physical, magic and DoT routines.',
    lines: [
      'LevelDiff = EnemyLevel − PlayerLevel',
      '',
      'No penalty if LevelDiff ≤ 0',
      '  LevelDiff < 10:  Damage = Damage / (LevelDiff² × 0.005 + 1)',
      '  LevelDiff ≥ 10:  Damage = Damage / (LevelDiff × 0.05 + 1)',
    ],
    notes: [
      'The two branches meet exactly at LevelDiff 10, where the penalty term is 0.5 either way - the damage is divided by 1.5, so about a third of it is lost',
      'Damage Over Time is the exception: it only ever uses the linear LevelDiff × 0.05 branch. That branch is the harsher of the two below LevelDiff 10, so a DoT is penalised more than a direct hit when the enemy is 1-9 levels above you, and identically at 10 or more',
    ],
  },
  {
    label: 'Critical Hit',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the crit roll in the client, which appears identically in the physical, magic and damage-over-time routines.',
    lines: [
      'IsCrit = rand(0, 99) < CritRate',
      '',
      'Damage = Damage × (100 + CritDamage) / 100',
    ],
    notes: [
      'CritRate and CritDamage are the two values shown in the Stats panel',
      'Power Knockback is hard-coded to always crit, whatever your CritRate is - matching its skill description',
      'Damage over time rolls this too, so a burn or a bleed tick can crit',
    ],
  },
  {
    label: 'Iron Arrow Falloff (Crossbow only)',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the client, hard-coded to Iron Arrow: Crossbow by skill ID.',
    lines: [
      'Damage = Damage × clamp(1 − ConsecutiveHits × 0.2, 0, 1)',
      '  1st mob: ×1.0,  2nd: ×0.8,  3rd: ×0.6 …',
    ],
    notes: [
      'No other skill in the game uses this step',
      'The skill caps at 4 targets, so the multiplier bottoms out at ×0.4 and never reaches the 0 floor',
    ],
  },
  {
    label: 'Shadow Partner (Hermit)',
    wip: false,
    status: 'partial',
    statusNote: 'The step is read directly from the client, but nothing in the code names the skill - there is no skill ID check, only a flag carried on the attack, so the attribution to Shadow Partner is inference.',
    lines: [
      'Damage = Damage × PartnerDamage / 100',
      '  applied only to hits in the second half of the hit list',
    ],
    notes: [
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Shadow Partner and the second-half hit split do not exist in COT1.',
      ],
    },
  },
  {
    label: 'Clamp',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the client - the same clamp ends both the physical and magic routines.',
    lines: [
      'Damage = trunc(Damage)',
      'Damage = clamp(Damage, 1, 99,999)',
    ],
    notes: [
      'The cap is 99,999. A single hit can never display more than that, whatever the numbers going in',
      'The floor means any hit that passes the accuracy check deals at least 1',
    ],
    cot1: {
      notes: [
        'COT1\'s cap was 700,000,000,000, with per-hit damage stored as a 64-bit integer. The 99,999 cap is new.',
      ],
    },
  },
];

const MOD_VARS = [
  { name: 'BaseWeaponDefense', desc: "Enemy's weapon defense stat, before modifiers" },
  { name: 'BaseMagicDefense',  desc: "Enemy's magic defense stat, before modifiers" },
  { name: 'WeaponDefense',   desc: "Enemy's weapon defense after percent and flat modifiers, floored at 0" },
  { name: 'MagicDefense',    desc: "Enemy's magic defense after percent and flat modifiers, floored at 0" },
  { name: 'PercentEffects',  desc: "A percentage modifier slot the monster carries for the defense stat being used. Weapon and magic defense read separate slots. On the weapon side this is what Threaten's -2% to -10% Weapon Def reduction feeds; nothing is known to fill the magic one" },
  { name: 'FlatEffects',     desc: "A flat modifier slot the monster carries for the defense stat being used, added after the percentage. Disorder's small Weapon Def reduction is the likely source on the weapon side; nothing is known to fill the magic one" },
  { name: 'ElementalMult',   desc: "Elemental modifier from the monster's resistance to the attack's element: 0.0, 0.75, 1.0 or 1.25 for a normal attack, and any of 0.0, 0.25, 0.5, 0.75, 1.0, 1.25 or 1.5 for Element Composition" },
  { name: 'EnemyLevel',      desc: "Enemy's level" },
  { name: 'PlayerLevel',     desc: "Player's level" },
  { name: 'LevelDiff',       desc: 'Enemy level minus player level. No penalty when this is 0 or below' },
  { name: 'CritRate',        desc: 'Critical hit rate % from the Stats panel' },
  { name: 'CritDamage',      desc: 'Critical damage % from the Stats panel (e.g. 20 → a ×1.2 multiplier)' },
  { name: 'ConsecutiveHits', desc: 'Iron Arrow: 0 for first mob hit, 1 for second, etc.' },
  { name: 'PartnerDamage',   desc: "Shadow Partner's damage %, carried on the attack" },
  { name: 'SkillMult',       desc: 'Skill Damage % as a decimal, the same value the Base Damage formulas use' },
  { name: 'Orbs',            desc: 'Combo Attack orbs stacked when the skill is cast, 1 to 5' },
  { name: 'ComboDamage',     desc: "Combo Attack's damage bonus % for the learned level (5 at level 1, 20 at level 30)" },
  { name: 'ChargeDamage',    desc: "The active elemental charge's damage bonus % for the learned level (2 at level 1, 20 at level 30)" },
];


// ─── Damage taken ─────────────────────────────────────────────

const GUARD_STEPS = [
  {
    label: 'Guard Immunity',
    wip: false,
    status: 'partial',
    statusNote: 'The check is read directly from the client, but the monster flag it reads has not been matched to a property in the monster data yet.',
    lines: [
      'A flag on the monster can switch guard off entirely for its attacks.',
    ],
    notes: [
      'When that flag is set the attack always resolves as a normal hit and neither roll below is reached',
      'No monster in the game data has been matched to this flag yet, so in practice every attack is currently guardable',
    ],
  },
  {
    label: 'Shield Guard',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the damage-taken routine in the client, including the 500 divisor and the 5% floor.',
    lines: [
      'ShieldDefense = Weapon Defense on the item in the shield slot',
      '',
      'Only rolled if ShieldDefense > 0:',
      '  GuardChance = max(0.05, ShieldDefense / (ShieldDefense + 500))',
      '',
      'Guarded = GuardChance > rand(0, 1)',
    ],
    notes: [
      'Only the shield slot counts. Weapon Defense from armour, accessories, buffs or skills adds nothing to the guard chance',
      'Any shield at all gives at least 5%, and the chance reaches 50% at 500 shield Weapon Defense',
      'Scrolled Weapon Defense on the shield counts',
    ],
  },
  {
    label: 'Claw Guard',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the client, hard-coded to Claw Guard by skill ID and to the Assassin job line.',
    lines: [
      'Only rolled for Assassin, Hermit and Night Lord:',
      '  Guarded = ClawGuardBlockChance / 100 > rand(0, 1)',
    ],
    notes: [
      'ClawGuardBlockChance is the block chance listed on the skill: 3% at levels 1-6, 4% at 7-13, 5% at 14-20',
      'This roll reuses the same random number as the Shield Guard roll, and it only runs when that roll has already failed. Because the shield chance is never below 5% and Claw Guard never goes above 5%, Claw Guard cannot fire while a shield with any Weapon Defense is equipped - it only does anything for the throwing-star setup it was written for',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Claw Guard does not exist in COT1 - neither the skill nor its code path. Shields were the only source of guards.',
      ],
    },
  },
  {
    label: 'Incoming Damage',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the two damage-taken routines and the monster attack-value getters in the client.',
    lines: [
      'IncomingDamage = MonsterAttack × (1.1 + 0.4 × rand(0, 1))',
    ],
    notes: [
      "MonsterAttack is the monster's physical attack for a regular attack, its magic attack for a skill attack, after its own percent modifiers",
      'Fixed-damage attacks take a third path that skips every step below, including defense',
    ],
    cot1: {
      notes: [
        'The roll is unchanged from COT1. The fixed-damage path existed there only as an empty stub returning 0 - COT2 implemented it.',
      ],
    },
  },
  {
    label: 'Player Defense',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from both damage-taken routines in the client, with every constant resolved.',
    lines: [
      'Defense = WeaponDefense for a regular attack, MagicDefense for a skill attack',
      '',
      'DefenseScale = 5 × PlayerLevel + 200 + 1.2 × IncomingDamage',
      '',
      'DamageTaken = IncomingDamage / (1 + Defense / DefenseScale)',
    ],
    notes: [
      'Same shape as the monster-side Weapon Defense and Magic Defense steps, which are IncomingDamage / (1 + Defense / 100). The difference is that a monster\'s scale is a fixed 100 while yours grows',
      'Defense equal to DefenseScale halves the hit, twice it cuts the hit to a third. It never reaches zero',
      'Because DefenseScale grows with your level, the same defense is worth less as you level. 300 Weapon Defense cuts about 39% off a 100 damage hit at level 30, but only about 25% at level 120',
      'Because DefenseScale grows with the hit, defense helps most against chip damage and least against what can kill you',
    ],
    cot1: {
      notes: [
        'COT1 had no level term at all: DamageTaken = IncomingDamage / (1 + Defense / (5 × IncomingDamage)). There, defense crushed chip damage but did little against big hits - COT2\'s scale rework flipped that and made defense decay as you level.',
      ],
    },
  },
  {
    label: 'Result',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the client - the damage is computed and then discarded on anything other than a clean hit.',
    lines: [
      'DamageTaken = clamp(DamageTaken, 1, 50000000), truncated',
      '',
      'DamageTaken = 0 if the hit missed or was guarded',
    ],
    notes: [
      'Any hit that lands takes at least 1 HP, no matter how much defense you have',
      'Guard is a full negation, not a reduction. The client still runs the whole damage calculation and then throws the number away, exactly as it does for a miss',
      'Guard is only rolled for a monster\'s regular attack. Monster skill attacks take a separate path that always resolves as a hit',
      'An attack can be flagged unmissable and still be guarded, the guard rolls sit after the accuracy check, not inside it',
    ],
  },
];

const GUARD_VARS = [
  { name: 'ShieldDefense', desc: 'Weapon Defense of the item equipped in the shield slot, scrolls included. Nothing else feeds this value' },
  { name: 'GuardChance',   desc: 'Chance for the hit to be negated outright' },
  { name: 'ClawGuardBlockChance', desc: "Claw Guard's block chance for the learned level (3, 4 or 5)" },
  { name: 'MonsterAttack', desc: "The monster's physical attack for a regular attack, or its magic attack for a skill attack, after its own percent modifiers" },
  { name: 'IncomingDamage', desc: 'The rolled damage of the hit, before the player\'s defense is applied' },
  { name: 'Defense',       desc: "The player's Weapon Defense against a regular attack, or Magic Defense against a skill attack, from the Stats panel" },
  { name: 'DefenseScale',  desc: 'How much defense is worth one unit of the tug-of-war. Defense equal to this halves the hit; twice this cuts it to a third' },
  { name: 'PlayerLevel',   desc: "Player's level" },
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

const STATUS_LABELS = { ok: 'Code Verified', partial: 'Partly Code Verified', warn: 'Educated Guess' };

// Where the formula came from and whether anyone has checked it in-game are two
// separate questions, so they get two separate tags.
const VALIDATION_LABELS = { pending: 'Requires Validation', done: 'In-Game Confirmed' };
const VALIDATION_NOTES = {
  pending: 'Nobody has confirmed this against live gameplay yet - it is what the game files say, not what anyone has measured.',
  done: 'Checked against live gameplay and matched.',
};

function attachTooltip(tag, text) {
  if (!text) return tag;
  tag.addEventListener('mouseenter', () => showStatusTooltip(tag, text));
  tag.addEventListener('mouseleave', hideStatusTooltip);
  return tag;
}

// Returns a fragment so callers can drop both tags in with one appendChild.
// `validated` is only meaningful for code-backed formulas - an educated guess
// carries no code claim to validate, so it gets no second tag.
function makeStatusTag(status, statusNote, validated) {
  const frag = document.createDocumentFragment();

  const statusTag = el('span', { className: `formulas-status-tag formulas-status-${status}`, textContent: STATUS_LABELS[status] });
  attachTooltip(statusTag, statusNote ?? (status === 'ok' ? 'Read straight out of the game files.' : null));
  frag.appendChild(statusTag);

  // `validated: null` opts out entirely - used for verbatim lookup tables, where
  // the values are the data itself and there is no behaviour to test against.
  if (status !== 'warn' && validated !== null) {
    const key = validated ? 'done' : 'pending';
    const validationTag = el('span', {
      className: `formulas-status-tag formulas-validation-${key}`,
      textContent: VALIDATION_LABELS[key],
    });
    attachTooltip(validationTag, VALIDATION_NOTES[key]);
    frag.appendChild(validationTag);
  }

  return frag;
}

function buildPipeline(steps) {
  const frag = document.createDocumentFragment();
  steps.forEach(({ label, wip, status, statusNote, validated, lines, notes, cot1 }, i) => {
    const step = el('div', { className: 'formulas-pipeline-step' });

    const stepHeader = el('div', { className: 'formulas-pipeline-header' });
    stepHeader.appendChild(el('span', { className: 'formulas-pipeline-badge', textContent: i + 1 }));
    stepHeader.appendChild(el('span', { className: 'formulas-pipeline-title', textContent: label }));
    if (wip) stepHeader.appendChild(el('span', { className: 'formulas-wip-tag', textContent: 'WIP' }));
    if (cot1) {
      const cot1Tag = el('span', {
        className: 'formulas-status-tag formulas-cot1-tag',
        textContent: cot1.badge ?? 'Changed from COT1',
      });
      attachTooltip(cot1Tag, 'This mechanic differs from Closed Online Test 1 - the Δ notes below say how. Both sides are read from the respective client binaries.');
      stepHeader.appendChild(cot1Tag);
    }
    if (status) stepHeader.appendChild(makeStatusTag(status, statusNote, validated));
    step.appendChild(stepHeader);

    const codeLines = lines.filter(l => l !== '');
    if (codeLines.length) {
      const pre = el('pre', { className: 'formulas-code' });
      pre.innerHTML = lines.map(l => l === '' ? '' : tokenizeLine(l)).join('\n');
      step.appendChild(pre);
    }

    if (notes?.length) {
      const noteWrap = el('div', { className: 'formulas-pipeline-notes' });
      notes.forEach(n => noteWrap.appendChild(el('div', { className: 'formulas-note', textContent: n })));
      step.appendChild(noteWrap);
    }

    if (cot1?.notes?.length) {
      const cot1Wrap = el('div', { className: 'formulas-cot1-notes' });
      cot1.notes.forEach(n => cot1Wrap.appendChild(el('div', { className: 'formulas-note', textContent: n })));
      step.appendChild(cot1Wrap);
    }

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

const EXP_RULES = [
  ['Level 1 to 5', 'Exp = (floor(Level² / 2) + 15) × Level'],
  ['Level 6 to 50', 'Exp = (floor(Level² / 3) + 19) × floor(Level² / 3)'],
  ['Level 51 to 119', 'Exp = trunc(PreviousLevelExp × 1.0548)'],
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
    decades: [1, 8], // 10 .. 100M
  },
  cumulative: {
    label: 'Cumulative',
    title: 'Total Exp to Reach Level',
    values: EXP_TABLE.map(([, , exp], i) => EXP_CUMULATIVE[i] + exp),
    decades: [1, 9], // 10 .. 1B
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
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild);

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
    [1, 20, 40, 60, 80, 100, 120].forEach(lvl => {
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

  const cot1Note = el('div', { className: 'formulas-cot1-notes' });
  cot1Note.appendChild(el('div', {
    className: 'formulas-note',
    textContent: 'COT1 used the same two rules but capped at level 50 - the ×1.0548 tail past level 50 is new in COT2, and the 1.0548 constant does not exist in the COT1 client at all.',
  }));
  container.appendChild(cot1Note);

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

  const tableWrap = el('div', { className: 'formulas-table-wrap' });
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
  CITIZENSHIP_GRADES.forEach(([grade, contribution, level]) => {
    const row = el('tr', { className: 'formulas-exp-row' });

    const gradeCell = el('td', { className: 'formulas-exp-td' });
    gradeCell.appendChild(el('span', { className: 'lvl-chip', textContent: `Grade ${grade}` }));
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
      textContent: charLevel === null ? '—' : `Lv ${charLevel}`,
    }));

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

  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The multiplier is picked by the attack animation, not the skill. Swing / Stab are the normal melee actions, Shoot covers bow, crossbow and claw attacks, and Other applies when a skill uses its own custom animation (e.g. Rush, Assaulter)' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Most skills roll for swing or stab just like a plain attack does. These ones never roll, each always uses the multiplier shown:' }));

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
  container.appendChild(buildPipeline(MOD_PIPELINE_STEPS));
  container.appendChild(buildVarLegend(MOD_VARS));
  return container;
}

// ─── Damage taken calculator ──────────────────────────────────

// Filled in by renderFormulas from the same appData the Monsters tab uses, so the
// calculator lists the real mobs with their real attack stats.
let CALC_MONSTERS = [];

// The COT2 defense scale: grows with the player's level and with the size of the hit.
const CALC_CONFIG = {
  get monsters() { return CALC_MONSTERS; },
  scale: (incoming, level) => 5 * level + 200 + 1.2 * incoming,
  scaleTerms: (incoming, level) => `5 × ${level} + 200 + 1.2 × ${incoming.toLocaleString()}`,
  useLevel: true,
  notes: (magic) => [
    'Assumes the attack lands. A miss deals 0, and the accuracy roll is not modelled here',
    magic
      ? 'Monster skill attacks cannot miss or be guarded, and they read your Magic Defense'
      : 'Regular attacks read your Weapon Defense and can be missed or guarded',
    'Fixed-damage attacks ignore all of this and deal their set amount',
  ],
};

function buildGuardSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(GUARD_STEPS));
  if (CALC_MONSTERS.length) container.appendChild(buildCalcLauncher(CALC_CONFIG));
  container.appendChild(buildVarLegend(GUARD_VARS));
  return container;
}



// ─── Page render ──────────────────────────────────────────────

export function renderFormulas(data) {
  // Sorted by level so the picker reads top-down like the Monsters tab does.
  CALC_MONSTERS = [...(data?.monsters?.monsters ?? [])]
    .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  const frag = document.createDocumentFragment();
  const wrapper = el('div', { className: 'formulas-page' });

  wrapper.appendChild(el('div', { className: 'section-heading', textContent: 'Formulas & Tables' }));

  const disclaimer = el('div', { className: 'formulas-disclaimer' });
  const disclaimerText = el('span');
  disclaimerText.appendChild(el('strong', { textContent: 'Warning: ' }));
  disclaimerText.append('Every formula has two tags. Code Verified means it came out of the COT2 game files. Partly Code Verified means the same, except some detail is a guess, usually which skill it applies to. Requires Validation means nobody has tested it in-game yet, so if the numbers do not match what you see, let us know.');
  disclaimer.appendChild(disclaimerText);
  wrapper.appendChild(disclaimer);

  // Full-width formula sections
  const fullWidth = el('div', { className: 'formulas-full' });

  const accuracySection = makeCollapsibleSection('Accuracy', '', buildAccuracySection);
  accuracySection.querySelector('.right').appendChild(
    makeStatusTag('ok', 'Read directly from the client binary')
  );
  const accCredit = el('span', { className: 'formulas-credit' });
  accCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> and <strong>@ohmi</strong> on Discord';
  accuracySection.querySelector('.left').appendChild(accCredit);

  const baseDmgSection = makeCollapsibleSection('Base Damage Formulas', '', buildBaseDamageSection);
  const dmgCredit = el('span', { className: 'formulas-credit' });
  dmgCredit.innerHTML = 'Reverse engineered by <strong>@Slash, @kirbypickr, @sublimerealist, @jimmybald</strong> and <strong>@ohmi</strong> on Discord';
  baseDmgSection.querySelector('.left').appendChild(dmgCredit);

  const modsSection = makeCollapsibleSection('Damage Modifications', '', buildModsSection);
  const modsCredit = el('span', { className: 'formulas-credit' });
  modsCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
  modsSection.querySelector('.left').appendChild(modsCredit);

  const guardSection = makeCollapsibleSection('Damage Taken', '', buildGuardSection);
  guardSection.querySelector('.right').appendChild(
    makeStatusTag('ok', 'Read directly from the damage-taken routine in the client, which resolves every incoming hit as hit, miss or guard.')
  );
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
  expSection.querySelector('.right').appendChild(
    makeStatusTag('ok', 'Read directly from the routine in the client that builds the experience table at startup.', null)
  );
  const expCredit = el('span', { className: 'formulas-credit' });
  expCredit.innerHTML = 'Reverse engineered by <strong>@wolffy</strong> and <strong>@ohmi</strong> on Discord';
  expSection.querySelector('.left').appendChild(expCredit);

  const weaponMultSection = makeCollapsibleSection('Weapon Min/Max Multipliers', '', buildWeaponMultTable);
  weaponMultSection.querySelector('.right').appendChild(
    makeStatusTag('ok', 'Read directly from the weapon multiplier table in the damage routine in the client.', null)
  );
  const weaponMultCredit = el('span', { className: 'formulas-credit' });
  weaponMultCredit.innerHTML = 'Reverse engineered by <strong>@kirbypickr, @Slash, @cptbattler, @ohmi</strong> on Discord, confirmed against the client binary';
  weaponMultSection.querySelector('.left').appendChild(weaponMultCredit);

  const citizenshipSection = makeCollapsibleSection('Citizenship Grades', '', buildCitizenshipTable);
  citizenshipSection.querySelector('.right').appendChild(
    makeStatusTag('partial', 'The contribution thresholds were read directly from the routine in the client that returns the requirement for a grade. The character level column comes from the same code path, but the field it is checked against is unlabelled, so reading it as character level is inference.')
  );

  const craftSection = makeCollapsibleSection('Crafting Levels', '', buildCraftTable);
  craftSection.querySelector('.right').appendChild(
    makeStatusTag('ok', 'Read directly from the routine in the client that returns the craft exp requirement for a level, and from the crafting window that consumes it. The character level column is the number the crafting window itself prints in its level-up tooltip.')
  );

  appendix.appendChild(weaponMultSection);
  appendix.appendChild(expSection);
  appendix.appendChild(craftSection);
  appendix.appendChild(citizenshipSection);
  wrapper.appendChild(appendix);

  frag.appendChild(wrapper);
  return frag;
}
