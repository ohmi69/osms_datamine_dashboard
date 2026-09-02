import { el, normalizeAssetPath } from '../lib/utils.js';
import { buildCalcLauncher } from './formulas-calc.js';
import { createFormulaBrowser, markFormulaSection, buildDamageFlow } from './formulas-layout.js';

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
// contribution column is NeedContribution (sub_1402C94E0) and the level column is
// NeedLevel (sub_1402C94C0); the Citizenship tab is the only caller of either. Grade,
// contribution required, character level required, grade name. The contribution
// column is the price of one grade, not a lifetime total - the window's gauge divides
// by NeedContribution(grade + 1), and an in-game reading of 450 / 2,000 at grade 2
// (grade 2 itself costs 1,000) proves the counter resets on each grade up.
// The names come from GetGradeName (sub_1402C8CF0), whose jump table maps grade 0-10
// to message ids 6094-6104; those live in the client's obfuscated message table and
// decrypt to the strings below. See tmp/citizenship-grade-binary.md.
const CITIZENSHIP_GRADES = [
  [1, 0, 12, 'Traveler'], [2, 1000, 17, 'Visitor'], [3, 2000, 22, 'Helpful Stranger'],
  [4, 3000, 27, 'Recognized Guest'], [5, 4000, 32, 'Town Resident'],
  [6, 5000, 37, 'Trusted Neighbor'], [7, 6000, 42, 'Distinguished Citizen'],
  [8, 7000, 47, 'Town Patron'], [9, 8000, 52, 'Guardian of the Village'],
  [10, 10000, 57, 'Citizen of Honor'],
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
  ['Dagger',          1,   2,   '-', 1.5],
  ['Wand',            1.8, 1.8, '-', 1.8],
  ['Staff',           1.8, 1.8, '-', 1.8],
  ['Barehanded',      1,   1,   1,   1  ],
];

// How the client picks a basic attack's animation: a uniform draw from the list the
// weapon owns (GetAttackAction sub_1407E5650, list table 0x143A4D6D0, keyed by the
// weapon's info/attack). The odds are just the make-up of that list - three swings and
// two stabs gives 60/40. See tmp/swing-stab-ratio-binary.md.
// This is the MELEE list. Bows, Crossbows and Claws have a second, ranged list at
// 0x143A4D880 (sub_1407E5A20, called from the shoot routine sub_1428D5B50) which is what
// a normal shot actually uses - bow shoot1, crossbow shoot2, claw swingO1/O2/O3. So for
// those three weapons the rows below are only reached when meleeing without ammo.
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

// Physical attack skills that never roll for swing or stab, grouped by the multiplier
// column they land in. Derived from the action classifier sub_14025E1F0, whose order is:
// skill property 48 -> use the weapon's default action; property 123 -> Other; then the
// action id ranges. Property 123 outranks the animation, which is why Dragon Fury is Other
// despite carrying swingP1/swingP2. Savage Blow (action 47) and Avenger (action 48) are
// hand-patched into the melee ranges by the same function.
// Magic skills are left out on purpose - magic damage never uses a weapon multiplier.
// See tmp/formulas-page-audit-2.md and tmp/savage-blow-weapon-multiplier-binary.md.
const ACTION_EXCEPTIONS = [
  ['Stab', ['Double Stab', 'Savage Blow']],
  ['Shoot', ['Avenger']],
  ['Other', ['Rush', 'Assaulter', 'Meso Explosion', 'Shout', 'Dragon Fury', 'Dragon Roar', 'Piercing Crusher', 'Silver Hawk', 'Golden Eagle']],
  ["Weapon's Default", ['Armor Crash', 'Threaten', 'Elemental Crash', 'Power Crash', 'Slow', 'Seal', 'Doom', 'Poison Breath', 'Poison Mist', 'Shadow Web', 'Arrow Bomb: Bow', 'Inferno', 'Blizzard']],
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
      'Avoid = trunc(Luk / 3) + trunc(Dex / 6) + 5',
    ],
    notes: [
      'Every stat here is the total including equipment and buffs, not the base value.',
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
        'WepMult is chosen by the attack action, not by the skill - see the Weapon Multipliers table. Lucky Seven overrides it to 3.0',
        'Combo Attack and the Elemental Charge both raise the Skill Damage % before anything else happens - see the Damage Modifications section',
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
      'Lucky Seven   forces WepMult = 3.0 in place of the Claw Shoot 2.5',
    ],
    notes: [
      'StatRoll and BaseRoll are two separate draws, so a hit can land low on one and high on the other. MIN and MAX are the corners of that rectangle, not the ends of a single roll, and damage bunches toward the middle rather than spreading evenly between them',
      'With the usual StatDiv of 100 and AtkDiv of 50 this is the familiar (100 + PrimaryStat × WepMult + SecondaryStat + AttackPower × 2) / 100 × WeaponAttack',
      'WepMult is chosen by the attack action, not by the skill - see the Weapon Multipliers table',
      'Bows, Crossbows and Claws draw their firing animation from a separate ranged action list, so a normal shot lands on Shoot (2.5, StatDiv 100). The StatDiv 300 rows are what you get meleeing with them - a Claw with no stars left stabs for 1.0',
      'Combo Attack and the Elemental Charge both raise the Skill Damage % before anything else happens - see the Damage Modifications section',
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
    statusNote: 'Derived from the client binary. The Magic term is the stat window\'s MAGIC value - confirmed by reading the same field the stat window\'s mad row displays.',
    lines: [
      'MIN = (BasicAttack / 100) × Magic × (TotalInt × MasteryMult / 100 + 1)',
      'MAX = (BasicAttack / 100) × Magic × (TotalInt / 100 + 1)',
    ],
    warnings: [
      'Magic and Magic Attack are two different numbers. Magic is the MAGIC stat on your stat window: Total Int / 2 plus Magic Attack.',
    ],
    notes: [
      'The roll between MIN and MAX is a single uniform random per hit',
      'BasicAttack is the skill\'s own value. Almost every magician attack skill carries one - the exceptions are Poison Mist, which is pure damage over time, Poison Breath, whose direct hit comes from a hidden second skill, and Heal, which replaces this formula outright.',
    ],
    cot1: {
      notes: [
        'Rewritten since COT1, which used (BasicAttack + Magic / 7) × ((Magic × 2 × MasteryMult + BaseInt) / 100 + 1) - and read base Int only, so Int from equipment did not count in the bracket.',
      ],
    },
  },
  {
    label: 'Heal',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the Heal branch of the magic damage routine in the client.',
    lines: [
      'HealAmount = ((TotalInt × Roll + TotalLuk) / 200 + 3) × Magic × (RecoveryRate / 100) × (TargetsHit × 0.1 + 1)',
      '',
      'Roll = rand(0.8, 1.0)',
      '',
      'HealAmount = HealAmount × (HealBonus / 100 + 1)',
      '',
      'Damage = trunc(HealAmount) / TargetsHit × 0.5',
    ],
    warnings: [
      'Magic and Magic Attack are two different numbers. Magic is the MAGIC stat on your stat window: Total Int / 2 plus Magic Attack.',
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
      'TotalDamage = (DoTBasicAttack / 100) × Magic × (TotalInt / 125 + 1)',
      '',
      'DamagePerTick = TotalDamage / DoTDurationSeconds',
    ],
    warnings: [
      'Magic and Magic Attack are two different numbers. Magic is the MAGIC stat on your stat window: Total Int / 2 plus Magic Attack.',
    ],
    notes: [
      'DoT damage ignores all Defense reductions - the routine never reads the enemy\'s weapon or magic defense at all',
      'Note the divisor is 125, not the 100 used everywhere else',
      'Every DoT skill in the game currently ticks once per second, so ticks and seconds are interchangeable here',
      'The Elemental Modifier, the Level Difference Penalty and the Critical Hit roll all apply to DoT, but DoT only ever uses the linear branch of the level penalty - see those steps',
    ],
    cot1: {
      notes: [
        'Rewritten since COT1, which used (DoTBasicAttack + Magic / 7) × ((Magic + BaseInt) / 100 + 1) with base Int and a divisor of 100 - the 125 divisor is new.',
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
  { name: 'StatDiv',       desc: 'Divides both stat terms. Chosen alongside WepMult by the weapon type and the attack action - values listed with the Physical Damage formula' },
  { name: 'AtkDiv',        desc: 'Divides the AttackPower term. Chosen the same way as StatDiv - values listed with the Physical Damage formula' },
  { name: 'MasteryMult',   desc: '(0.1 + MasteryLevel / 10) × 0.8, where MasteryLevel runs 1 to 10. Physical attacks read MasteryLevel from the weapon mastery skill for the equipped weapon; magic attacks read it from the attacking skill\'s own data instead, so a weapon mastery skill never affects magic. Exception: Lucky Seven ignores mastery skills entirely and takes its multiplier straight from its own skill data, which is 0.5 at every level - the same as a MasteryLevel of 5.25' },
  { name: 'BasicAttack',   desc: 'Basic Attack value listed on the skill, for magic skills only' },
  { name: 'DoTBasicAttack', desc: 'The "deals N Basic Attack over X sec" value listed on the skill' },
  { name: 'Magic',              desc: 'The MAGIC value on the stat window. The client builds it as TotalInt / 2 Magic Attack. It keeps only this one number, and every magic formula reads it' },
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
    label: 'Element Amplification',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the client. The buff slot is named Element Amplification in the client\'s own list of buff names, and the same slot also drives the matching extra MP cost, which confirms the identification. The skill it belongs to is not in this game\'s data, so the step can never fire.',
    lines: [
      'Damage = Damage × (ElementAmpDamage / 100 + 1)',
    ],
    notes: [
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
  { name: 'ElementAmpDamage', desc: "Damage bonus % from the Element Amplification buff, taken as the y value of whichever skill fills the slot. Magic and DoT only. The client supports it, but the skill is not in this game's data, so it never fires" },
];


// ─── Damage taken ─────────────────────────────────────────────

const GUARD_STEPS = [
  {
    label: 'Monster Accuracy',
    wip: false,
    status: 'ok',
    statusNote: 'Read directly from the outcome routine in the client, with every constant resolved. This is a different formula from the one your own attacks use',
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
      '',
      'A failed roll is still a hit 8% of the time.',
    ],
    notes: [
      'Avoid has hard diminishing returns. Dividing by Avoid / 80 + 1 means the effective value climbs toward 80 and never passes it, however much Avoid you stack',
      'Out-levelling a monster helps twice over: it lowers the monster\'s hit score, though it also shrinks your effective Avoid',
      'Nothing makes you untouchable. Whenever the roll fails, the client gives the attack a flat 8% second chance, and if your Avoid is high enough that the roll could never have landed it first rolls a separate 2% chance on top of that',
      'An attack can be flagged unmissable, which skips this whole step - it still has to get past the guard rolls below',
    ],
  },
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
    ],
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
    label: 'Invincible (Cleric)',
    wip: false,
    status: 'partial',
    statusNote: 'The step is read directly from the damage-taken routine, including the job check and the 50% ceiling.',
    lines: [
      'Only for Cleric, Priest and Bishop, and only against a regular attack:',
      '  DamageTaken = DamageTaken × (1 − InvincibleReduction / 100)',
    ],
    notes: [
      'InvincibleReduction is the skill\'s own value, 10% at level 1 rising to 30% at level 20',
      'Regular attacks only. A monster skill attack skips this step, matching the skill description, which says physical damage',
    ],
    cot1: {
      badge: 'New in COT2',
      notes: [
        'Neither the skill nor this branch exists in COT1.',
      ],
    },
  },
  {
    label: 'Elemental Damage Reduction',
    wip: false,
    status: 'partial',
    statusNote: 'The step is read directly from both damage-taken routines and the getter they call. The four values are buff slots with no skill id attached, so naming Elemental Resistance as the source is inference.',
    lines: [
      'DamageTaken = DamageTaken × (1 − ElementResist / 100)',
    ],
    notes: [
      'Applies to both regular and skill attacks, straight after your defense',
    ],
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
  { name: 'MonsterAcc',    desc: "The monster's accuracy stat" },
  { name: 'MonsterLevel',  desc: "The monster's level" },
  { name: 'LevelGap',      desc: 'Your level minus the monster\'s level, or 0 if the monster is the higher level' },
  { name: 'Avoid',         desc: "Your Avoid stat from the Stats panel, before the diminishing-returns step" },
  { name: 'EffectiveAvoid', desc: 'Avoid after diminishing returns and the level-gap term. Climbs toward 80 and never passes it' },
  { name: 'MonsterHitScore', desc: "The monster's accuracy scaled against the level gap - what the roll is measured against" },
  { name: 'InvincibleReduction', desc: "Invincible's damage reduction % for the learned level (10 at level 1, 30 at level 20)" },
  { name: 'ElementResist', desc: 'Percentage reduction for the element of the incoming attack, from one of four buff slots' },
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

function buildPipeline(steps, chapterStarts = {}) {
  const frag = document.createDocumentFragment();
  steps.forEach(({ label, wip, status, statusNote, validated, lines, notes, warnings, cot1, simple }, i) => {
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

      if (cot1?.notes?.length) {
        const cot1Wrap = el('div', { className: 'formulas-cot1-notes' });
        cot1.notes.forEach(n => cot1Wrap.appendChild(el('div', { className: 'formulas-note', textContent: n })));
        body.appendChild(cot1Wrap);
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
    textContent: 'Each figure is the price of that one grade, not a lifetime total - the counter resets on every grade up, and the Citizenship window shows it against the cost of the next grade. Grade 1 is granted by the citizenship quest, and the whole climb to Grade 10 costs 46,000.',
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

function buildHitDetectionOverview() {
  const container = el('div', { className: 'formulas-formula-wrap' });

  const block = el('div', { className: 'formulas-code-block' });
  [
    ['Hidden shapes', 'Attack area = the invisible shape used to look for targets\nMonster collision area = the invisible box where a monster can be hit'],
    ['The rule', 'A monster is picked when those two hidden shapes overlap.\nSome attacks then check walls, platforms, and slopes. This depends on the attack\'s targeting routine: the current generic player-skill routes, including Magic Claw, install this check; a few special routes skip it.'],
  ].forEach(([label, line]) => {
    const cell = el('div', { className: 'formulas-code-cell' });
    cell.appendChild(el('div', { className: 'formulas-code-label', textContent: label }));
    cell.appendChild(el('pre', { className: 'formulas-code', textContent: line }));
    block.appendChild(cell);
  });
  container.appendChild(block);

  const tableWrap = el('div', { className: 'formulas-table-wrap' });
  tableWrap.appendChild(el('div', { className: 'formulas-subhead', textContent: 'What happens when you attack' }));
  tableWrap.appendChild(buildTable(
    [['Step', 'num'], ['Game check', ''], ['What you notice', '']],
    [
      ['1', 'Make the attack area', 'The game places an invisible box, line, or widening area from the point at your character\'s feet. Turning around mirrors areas that attack in the direction you face.'],
      ['2', 'Find monsters inside it', 'The attack area must overlap a monster\'s collision area. Touching only at an edge does not count, and visible artwork does not matter.'],
      ['3', 'Choose the final targets', 'Widening ranged skills check nearest monsters first. Other attacks use the game\'s own list order. The game applies the skill\'s target limit (at most 15). Attacks that use a terrain check then lose blocked targets, without replacements.'],
      ['4', 'Play the attack', 'Damage lines, projectiles, and effects use this finished target list. They do not look for more monsters.'],
    ],
  ));
  container.appendChild(tableWrap);
  container.appendChild(el('div', {
    className: 'formulas-note formulas-note--padded',
    textContent: 'The foot marker in the diagrams is the starting point for every attack area. It is not your hands or weapon. Most ranged skills use a widening area, while ordinary ranged shots use a separate one-pixel target line 28 pixels above that point. Visible effects do not change either hidden shape.',
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
    'A weapon swing target area overlapping a monster',
    (svg, { width, groundY }) => {
      const originX = 64;
      addHitvizGround(svg, 0, width, groundY);
      svg.appendChild(svgEl('rect', { x: 78, y: 82, width: 82, height: 57, class: 'hitviz-hitbox' }));
      addHitvizMob(svg, 136, 78, 42, 67);
      svg.appendChild(svgEl('rect', { x: 136, y: 82, width: 24, height: 57, class: 'hitviz-overlap' }));
      addHitvizCharacter(svg, originX, groundY);
      addHitvizText(svg, 'current swing area', 119, 58, 'hitviz-svg-text--hitbox');
      addHitvizText(svg, 'overlap = target', 191, 119, 'hitviz-svg-text--effect');
    },
    'The current weapon swing supplies the hidden target area, so the area can change with the swing animation.',
    [
      ['primary', 'Swing target area'],
      ['monster', 'Monster collision area'],
      ['overlap', 'Overlap selects target'],
    ],
  ));

  addCard('triggered-splash', buildAttackTypeVisual(
    'Melee with a triggered splash',
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
      addHitvizText(svg, 'first swing area', 99, 56, 'hitviz-svg-text--hitbox');
      addHitvizText(svg, 'extends forward only', 166, 42, 'hitviz-svg-text--secondary-area');
    },
    'If the first swing finds exactly one monster, Slash Blast keeps the same height and extends only the front edge: 130 px at Lv. 1–10 and 150 px at Lv. 11–20.',
    [
      ['primary', 'First target check'],
      ['secondary', 'Extra forward range after one hit'],
      ['monster', 'Monster collision area'],
      ['overlap', 'Max-range overlap'],
    ],
  ));

  addCard('normal-ranged', buildAttackTypeVisual(
    'Normal ranged shots',
    'Normal bow, crossbow, and throwing-star attacks',
    'type-normal-ranged',
    'A normal ranged shot selecting a monster whose collision area crosses its horizontal target line',
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
    'This hidden one-pixel horizontal line is the target area for an ordinary ranged shot. It sits 28 px above your feet, starts 65 px in front of you, and ends at the shot\'s calculated range. A monster is considered only when its collision area crosses the line.',
    [
      ['target-line', 'One-pixel target line'],
      ['monster', 'Monster collision area'],
    ],
  ));

  addCard('ranged-projectile', buildAttackTypeVisual(
    'Projectile skills using ranged targeting',
    'Arrow Blow, Energy Bolt',
    'type-ranged-projectile-skill',
    'A projectile skill selecting a monster anywhere inside a widening target area',
    (svg, { width, groundY }) => {
      const originX = 40;
      const nearX = originX + 65;
      addHitvizGround(svg, 0, width, groundY);
      addHitvizRangedCorridor(svg, originX, groundY, nearX, 279);
      addHitvizMob(svg, 235, groundY - 70, 42, 70);
      addHitvizCharacter(svg, originX, groundY);
      addHitvizText(svg, 'widening target area', 175, 28, 'hitviz-svg-text--hitbox');
    },
    'Most ranged skills use a hidden area that widens with distance. A monster is considered when its collision area overlaps that area.',
    [
      ['primary', 'Widening target area'],
      ['monster', 'Monster collision area'],
    ],
    { height: 200, groundY: 115 },
  ));

  addCard('area-skills', buildAttackTypeVisual(
    'Centered or directional areas',
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
      ['primary', 'Target area'],
      ['monster', 'Monster collision area'],
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
        : 'Projectile skill checking terrain diagonally from the point at the character\'s feet',
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
    addHitvizText(svg, rayStartsAtLine ? 'target line' : 'widening target area', 185, stripY - 10, 'hitviz-svg-text--hitbox');

    return buildHitvizCard(
      title,
      eyebrow,
      svg,
      rayStartsAtLine
        ? 'The game checks for blocking terrain from the one-pixel target line, straight across to the monster.'
        : 'The widening area finds a monster first. The game then checks for blocking terrain from your feet to the closest edge of that monster\'s collision area.',
      [
        [rayStartsAtLine ? 'target-line' : 'primary', rayStartsAtLine ? 'One-pixel target line' : 'Widening target area'],
        ['ray-start', 'Start of terrain check'],
        ['check-line', 'Terrain check, not projectile'],
        ['monster', 'Monster collision area'],
      ],
    );
  };

  grid.appendChild(buildPanel('Normal ranged shot', 'Terrain check starts on target line', 'hitviz-grid-normal-ray', true));
  grid.appendChild(buildPanel('Projectile skill with a widening area', 'Projectile terrain check', 'hitviz-grid-skill-ray', false));
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
    'This terrain check is used by normal projectile attacks and many box-shaped skills. The game checks a straight line from your feet toward the monster. A line that enters a terrain edge from its blocking side removes the monster from the target list. Magic Claw uses this check in the current client.',
    [
      ['check-line', 'Line checked for terrain'],
      ['terrain', 'Blocking terrain'],
      ['monster', 'Monster collision area'],
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
  addHitvizText(svg, 'leaves platform downward: blocked', originX + 15, originY + 28, 'hitviz-svg-text--blocked');
  addHitvizText(svg, 'target area reaches Stump', targetX, 113, 'hitviz-svg-text--hitbox');
  addHitvizDimension(svg, originX, 250, targetX, 250, '300 px horizontal range', 285, 270);
  return buildHitvizCard(
    'Target blocked crossing downward',
    'Attacking from above',
    svg,
    'The character stands on the platform that is tested. The terrain line starts at their feet and immediately leaves the platform downward into its blocking side, so the client removes the Stump.',
    [
      ['primary', 'Target area'],
      ['check-line', 'Line checked for terrain'],
      ['platform', 'One-way platform'],
      ['monster', 'Stump collision area'],
      ['blocked', 'Blocked point'],
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
  addHitvizText(svg, 'target area reaches Stump', targetX, 37, 'hitviz-svg-text--hitbox');
  addHitvizDimension(svg, originX, 250, targetX, 250, '300 px horizontal range', 285, 270);
  return buildHitvizCard(
    'Target kept crossing upward',
    'Attacking from below',
    svg,
    'The character stands on the lower platform. The terrain line leaves that platform upward and crosses the Stump\'s platform from below to above. Both contacts move toward the open side, so the client keeps the Stump.',
    [
      ['primary', 'Target area'],
      ['check-line', 'Line checked for terrain'],
      ['platform', 'One-way platform'],
      ['monster', 'Stump collision area'],
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
    textContent: 'Every attack starts with a hidden area positioned from the point at your character\'s feet. Turning mirrors directional areas; artwork, weapon reach, and effect placement do not change this hidden area.',
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
    'Step 2 · hidden attack areas',
    svg,
    'The attack area and monster collision area must share some width and height. If their edges only touch, the monster is not selected.',
    [
      ['primary', 'Attack area'],
      ['monster', 'Monster collision area'],
      ['overlap', 'Positive overlap'],
    ],
  );
}

function buildOverlapGuide() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildCollisionOverlapVisual());

  const tableWrap = el('div', { className: 'formulas-table-wrap' });
  tableWrap.appendChild(buildTable(
    [['When the hidden boxes…', ''], ['What that means', ''], ['Result', '']],
    [
      ['Overlap', 'The attack area and collision area share real space in both directions.', 'The monster can become a target.'],
      ['Only touch at an edge', 'The boxes meet, but share no area.', 'The monster is not selected.'],
      ['Use a second collision format', 'The game contains another way to store collision shapes, but no current monster uses it.', 'Every current monster uses one or more rectangular collision areas.'],
      ['Visible sprites touch', 'The game does not use the visible weapon, projectile, or effect pixels for this check.', 'A visible touch does not select a monster.'],
    ],
  ));
  container.appendChild(tableWrap);
  container.appendChild(el('div', {
    className: 'formulas-note formulas-note--padded',
    textContent: 'Passing this step makes a monster a candidate, not a guaranteed target. The game can still remove it because of target order or the skill\'s target limit. Attacks that use a terrain check can also lose targets behind solid terrain.',
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

function buildFinalTargetGuide() {
  const container = el('div', { className: 'formulas-formula-wrap' });

  const terrainIntro = el('aside', { className: 'hitviz-terrain-intro' });
  terrainIntro.appendChild(el('div', {
    className: 'hitviz-terrain-intro-title',
    textContent: 'How the terrain-check line works',
  }));
  terrainIntro.appendChild(el('p', {
    textContent: 'Some attacks use an invisible line to decide whether a target is reachable. It is a target check, not the projectile\'s visible flight path. Terrain edges are one-sided: entering a blocking side removes the target, while leaving upward does not.',
  }));
  const terrainRules = el('div', { className: 'hitviz-terrain-intro-rules' });
  [
    ['Normal ranged shot', 'Checks straight across from its one-pixel target line.'],
    ['Widening projectile skill', 'Checks from your feet to the monster\'s closest edge.'],
    ['Many box-shaped skills', 'Also check from your feet toward the monster.'],
  ].forEach(([label, description]) => {
    const rule = el('div', { className: 'hitviz-terrain-intro-rule' });
    rule.appendChild(el('strong', { textContent: label }));
    rule.append(description);
    terrainRules.appendChild(rule);
  });
  terrainIntro.appendChild(terrainRules);
  container.appendChild(terrainIntro);

  container.appendChild(buildRangedTerrainComparisonVisual());

  container.appendChild(buildObstructionVisual());

  const platformDirectionGrid = el('div', { className: 'hitviz-type-grid hitviz-type-grid--comparison' });
  platformDirectionGrid.appendChild(buildDownwardPlatformObstructionVisual());
  platformDirectionGrid.appendChild(buildUpwardPlatformClearVisual());
  container.appendChild(platformDirectionGrid);

  const terrainWrap = el('div', { className: 'formulas-table-wrap' });
  terrainWrap.appendChild(buildTable(
    [['Attack type', ''], ['Can terrain block it?', ''], ['Examples', '']],
    [
      ['Normal ranged shots', 'Yes. They launch a projectile and check straight across from the one-pixel target line.', 'Ordinary bow, crossbow, and throwing-star attacks.'],
      ['Projectile skills with a widening area', 'Yes. They first find a monster in the widening area, then check from your feet to the monster\'s closest edge.', 'Arrow Blow, Energy Bolt, and other skills that launch a projectile.'],
      ['Magic Claw and other generic widening skills', 'Yes. Their common skill route installs the terrain check.', 'A target behind solid attack terrain can be removed after selection.'],
      ['Many box-shaped skills', 'Yes. They check from your feet toward the monster after the target area finds it.', 'Power Strike, Slash Blast, Savage Blow, Arrow Rain, Arrow Eruption, and most other skill areas.'],
      ['Band of Thieves', 'No. This skill skips the terrain check.', 'Its opening swing must first find exactly one monster before the full area is used.'],
      ['Meso Explosion', 'No. This skill skips the terrain check.', 'It selects dropped meso coins, then searches around each selected coin.'],
    ],
  ));
  container.appendChild(terrainWrap);

  const selectionWrap = el('div', { className: 'formulas-table-wrap' });
  selectionWrap.appendChild(el('div', { className: 'formulas-subhead', textContent: 'Which candidates are kept first' }));
  selectionWrap.appendChild(buildTable(
    [['Attack type or rule', ''], ['How candidates are ordered', '']],
    [
      ['Ordinary skills', 'Uses the game\'s internal list of objects on the map. There is no closest-first sort, and we have not yet determined how that list order is made.'],
      ['Normal basic attacks', 'Uses the same unsorted list of objects on the map, so nearest-first is not guaranteed.'],
      ['Ranged skills with a widening area', 'Nearest monster to your feet first.'],
      ['Band of Thieves', 'Nearest monster first. If the nearest is behind you, it prefers the nearest monster in front; if none is in front, it keeps the original nearest monster.'],
      ['Meso Explosion', 'Checks dropped meso coins in internal list order. A coin is kept only if the area around it finds a monster, and selection stops at the skill\'s coin limit.'],
      ['Target limit before terrain check', 'The game fills the skill\'s target limit first (never above 15). An attack that uses a terrain check then removes blocked targets without replacing them, so order matters when too many monsters are in range.'],
    ],
  ));
  container.appendChild(selectionWrap);

  container.appendChild(el('div', {
    className: 'formulas-note formulas-note--padded',
    textContent: 'Only an attack that uses a terrain check can be stopped by walls, platforms, or slopes marked as solid for attacks; decorative map art cannot stop it. Band of Thieves and Meso Explosion use special routes that skip this check and can select through that terrain. The game server can still reject a target that your game client selected.',
  }));
  return container;
}

function buildSkillHitDetectionCases() {
  const container = el('div', { className: 'formulas-formula-wrap' });

  const tableWrap = el('div', { className: 'formulas-table-wrap' });
  tableWrap.appendChild(buildTable(
    [['Skill or family', ''], ['Target check', ''], ['Special result', '']],
    [
      ['Slash Blast / Coma / Charged Blow', 'The first swing must find exactly one monster before the larger area is used.', 'Only the front edge grows. If the first swing finds zero or more than one monster, the area stays the same.'],
      ['Band of Thieves', 'The opening swing must find exactly one monster before the full attack area is used.', 'It uses the special nearest-first rule described above and skips the terrain check.'],
      ['Meso Explosion', 'It first selects nearby dropped meso coins; it then looks for a monster around each selected coin.', 'It skips the terrain check.'],
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

  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The multiplier is picked by the attack animation, not the skill. Swing / Stab are the normal melee actions, Shoot covers bow, crossbow and claw attacks, and Other applies when a skill uses its own custom animation (e.g. Rush, Assaulter)' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'The Swing/Stab ratio above is the melee animation list. Bows, Crossbows and Claws normally fire instead, drawing from a separate ranged list that always resolves to Shoot, a Claw throwing a star rolls swingO1/O2/O3, which the client rewrites to Shoot because the weapon is a Claw. Their Swing and Stab columns are only reached when meleeing without ammo.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Most skills roll for swing or stab just like a plain attack does. These ones never roll. The first three groups always use the multiplier shown; the last group takes whichever action the weapon defaults to, which is always that weapon\'s best column - Stab for 1H Swords, 2H Swords, Daggers, Spears, Wands, Staves and bare hands, Swing for Axes, Blunt Weapons and Polearms, and Shoot for Bows, Crossbows and Claws. Magic skills are left out because magic damage never uses a weapon multiplier at all.' }));

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
    11: { key: 'final-result', label: 'Final Result', description: 'The client’s final lower bound before the hit is applied.' },
  }));
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
    'Assumes the attack lands. A miss deals 0, and the accuracy roll is not modelled here, see the Monster Accuracy step for what decides that',
    magic
      ? 'Monster skill attacks cannot miss or be guarded, and they read your Magic Defense'
      : 'Regular attacks read your Weapon Defense and can be missed or guarded',
    'Invincible and elemental resistance are not modelled here either - both cut the number below further',
  ],
};

function buildGuardSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(GUARD_STEPS, {
    0: { key: 'hit-check', label: 'Hit Check', description: 'Whether an ordinary monster attack reaches the player.' },
    1: { key: 'guard-resolution', label: 'Guard Resolution', description: 'Immunity and shield or claw guard checks.' },
    4: { key: 'damage-reduction', label: 'Damage Reduction', description: 'Incoming roll, player defense, and additional reductions.' },
    8: { key: 'incoming-result', label: 'Result', description: 'The final outcome returned by the incoming-hit routine.' },
  }));
  if (CALC_MONSTERS.length) container.appendChild(buildCalcLauncher(CALC_CONFIG));
  container.appendChild(buildVarLegend(GUARD_VARS));
  return container;
}



// ─── Page render ──────────────────────────────────────────────

export function renderFormulas(data, options = {}) {
  // Sorted by level so the picker reads top-down like the Monsters tab does.
  CALC_MONSTERS = [...(data?.monsters?.monsters ?? [])]
    .sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  const disclaimer = el('div', { className: 'formulas-disclaimer' });
  const disclaimerText = el('span');
  disclaimerText.appendChild(el('strong', { textContent: 'Warning: ' }));
  disclaimerText.append('Every formula has two tags. Code Verified means it came out of the COT2 game files. Partly Code Verified means the same, except some detail is a guess, usually which skill it applies to. Requires Validation means nobody has tested it in-game yet, so if the numbers do not match what you see, let us know.');
  disclaimer.appendChild(disclaimerText);
  const section = (title, key, bodyFn) => markFormulaSection(makeCollapsibleSection(title, '', bodyFn), key);
  const group = (...children) => el('div', { className: 'formulas-full' }, ...children);

  const buildAccuracyPage = () => {
    const accuracy = section('Accuracy', 'accuracy-formulas', buildAccuracySection);
    accuracy.querySelector('.right').appendChild(makeStatusTag('ok', 'Read directly from the client binary'));
    const credit = el('span', { className: 'formulas-credit' });
    credit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> and <strong>@ohmi</strong> on Discord';
    accuracy.querySelector('.left').appendChild(credit);
    return group(accuracy);
  };

  const buildHitDetectionPage = () => {
    const overview = section('How Targeting Works', 'targeting-pipeline', buildHitDetectionOverview);

    const area = section('1. Build the Target Area', 'attack-families', buildAttackAreaGuide);

    const overlap = section('2. Test Monster Overlap', 'target-overlap', buildOverlapGuide);

    const finalTargets = section('3. Check Targets Against Terrain', 'ranged-terrain', buildFinalTargetGuide);

    const cases = section('Skills with Special Targeting Rules', 'skill-cases', buildSkillHitDetectionCases);

    return group(overview, area, overlap, finalTargets, cases);
  };

  const buildDamagePage = () => {
    const base = section('Base Damage Formulas', 'base-damage', buildBaseDamageSection);
    const baseCredit = el('span', { className: 'formulas-credit' });
    baseCredit.innerHTML = 'Reverse engineered by <strong>@Slash, @kirbypickr, @sublimerealist, @jimmybald</strong> and <strong>@ohmi</strong> on Discord';
    base.querySelector('.left').appendChild(baseCredit);

    const weapons = section('Weapon Min/Max Multipliers', 'weapon-multipliers', buildWeaponMultTable);
    weapons.querySelector('.right').appendChild(makeStatusTag('ok', 'Read directly from the weapon multiplier table in the damage routine in the client.', null));
    const weaponCredit = el('span', { className: 'formulas-credit' });
    weaponCredit.innerHTML = 'Reverse engineered by <strong>@kirbypickr, @Slash, @cptbattler, @ohmi</strong> on Discord, confirmed against the client binary';
    weapons.querySelector('.left').appendChild(weaponCredit);

    const mods = makeCollapsibleSection('Damage Modification Pipeline', '', buildModsSection);
    const modsCredit = el('span', { className: 'formulas-credit' });
    modsCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
    mods.querySelector('.left').appendChild(modsCredit);
    return group(base, weapons, mods);
  };

  const buildDamageTakenPage = () => {
    const guard = makeCollapsibleSection('Damage Taken Pipeline', '', buildGuardSection);
    guard.querySelector('.right').appendChild(makeStatusTag('ok', 'Read directly from the damage-taken routine in the client, which resolves every incoming hit as hit, miss or guard.'));
    const credit = el('span', { className: 'formulas-credit' });
    credit.innerHTML = 'Reverse engineered by <strong>@ohmi</strong> on Discord';
    guard.querySelector('.left').appendChild(credit);
    return group(guard);
  };

  const buildProgressionPage = () => {
    const exp = section('Experience Table', 'experience', buildExpTable);
    exp.querySelector('.right').appendChild(makeStatusTag('ok', 'Read directly from the routine in the client that builds the experience table at startup.', null));
    const expCredit = el('span', { className: 'formulas-credit' });
    expCredit.innerHTML = 'Reverse engineered by <strong>@wolffy</strong> and <strong>@ohmi</strong> on Discord';
    exp.querySelector('.left').appendChild(expCredit);

    const craft = section('Crafting Levels', 'crafting-levels', buildCraftTable);
    craft.querySelector('.right').appendChild(makeStatusTag('ok', 'Read directly from the routine in the client that returns the craft exp requirement for a level, and from the crafting window that consumes it. The character level column is the number the crafting window itself prints in its level-up tooltip.'));

    const citizenship = section('Citizenship Grades', 'citizenship-grades', buildCitizenshipTable);
    citizenship.querySelector('.right').appendChild(makeStatusTag('ok', 'The contribution thresholds and character level column come from the client and have been confirmed against the Citizenship window in game.'));
    return group(exp, craft, citizenship);
  };

  return createFormulaBrowser({
    notice: disclaimer,
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
          { key: 'attack-families', label: '1. Target area' },
          { key: 'target-overlap', label: '2. Overlap' },
          { key: 'ranged-terrain', label: '3. Terrain checks' },
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
      {
        key: 'damage-taken', label: 'Damage Taken', kicker: 'What happens when a monster attacks?',
        description: 'Follow the hit check, guard roll, defense scaling, reductions, and final incoming result.',
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
    ],
  });
}
