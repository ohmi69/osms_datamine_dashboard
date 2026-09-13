// Slider windows are exploration ranges, not character caps. Read the selected
// patch's equipment/skill exports; do not let admin equipment set player ranges.
const max = (values, fallback = 0) => Math.max(fallback, ...values.filter(Number.isFinite));
const rounded = value => Math.ceil(value / 10) * 10;
const stat = (item, key) => Number.isFinite(item?.stats?.[key]) ? item.stats[key] : 0;
const matches = (lines, pattern) => lines.flatMap(line => [...line.matchAll(pattern)].map(m => Number(m[1])));
const last = skill => skill?.all_level_stats?.slice(-1) ?? [];

export function deriveGraphData(data, weaponMultipliers) {
  const items = data?.items?.items ?? [];
  const scrolls = data?.items?.scrolls ?? [];
  const skills = Object.values(data?.skills ?? {}).filter(Array.isArray)
    .flatMap(groups => groups.flatMap(group => group.skills ?? []));
  const lines = skills.flatMap(skill => skill.all_level_stats ?? []);
  const equipment = items.filter(item => item.category === 'Equipment'
    && !/wizet|invincible|secret agent/i.test(item.name)
    && !Object.entries(item.stats ?? {}).some(([key, value]) => /^inc(STR|DEX|INT|LUK)$/.test(key) && value >= 999));
  const weapons = equipment.filter(item => item.sub_category === 'Weapon');
  const shields = equipment.filter(item => item.sub_category === 'Shield');
  const scrollBonus = (pattern, predicate = () => true) => max(matches(
    scrolls.filter(predicate).map(scroll => scroll.description ?? ''), pattern));
  const magicScroll = scrollBonus(/Magic Attack \+(\d+)/g);
  const shieldScroll = scrollBonus(/Weapon Def\. \+(\d+)/g, scroll => scroll.equip_slot === 'Shield');
  const scrolled = (item, key, bonus) => stat(item, key) + stat(item, 'tuc') * bonus;
  const sword = weapons.find(item => item.name === 'Gladius')
    ?? weapons.find(item => item.weapon_type === '1H Sword');
  const wand = weapons.find(item => item.name === 'Mithril Wand')
    ?? weapons.find(item => item.weapon_type === 'Wand');
  const shield = shields.find(item => item.name === 'Red Triangular Shield') ?? shields[0];
  const powerStrike = skills.find(skill => skill.name === 'Power Strike');
  const magicClaw = skills.find(skill => skill.name === 'Magic Claw');
  const masteryLevels = matches(lines, /Mastery level (\d+)/gi);
  const masteryMax = max(masteryLevels, 10);
  const swordMastery = skills.find(skill => skill.name === 'Sword Mastery');
  const maxRequirement = key => max(weapons.map(item => stat(item, key)), 100);
  // Requirements are not player totals. Twice the highest weapon requirement is
  // an explicitly estimated initial window; typed totals can expand it.
  const intRange = rounded(maxRequirement('reqINT') * 2);
  const nonWeapon = equipment.filter(item => !['Weapon', 'Shield'].includes(item.sub_category));
  // A per-slot envelope, not a promise these pieces/buffs can all be equipped together.
  const slots = [...new Set(nonWeapon.map(item => item.sub_category))];
  const gearAttack = slots.reduce((sum, slot) => sum + max(nonWeapon.filter(item => item.sub_category === slot)
    .map(item => stat(item, 'incPAD'))), 0);
  const gloveScroll = scrollBonus(/Weapon Attack \+(\d+)/g, scroll => /glove/i.test(scroll.equip_slot));
  const gloveBonus = max(nonWeapon.filter(item => item.sub_category === 'Glove').map(item => stat(item, 'tuc'))) * gloveScroll;
  const buffAttack = max(matches(lines, /Attack Power \+(\d+)/g));
  const maxMagicAttack = max(weapons.map(item => scrolled(item, 'incMAD', magicScroll)), 100);
  const physicalMastery = max(matches(last(swordMastery), /Mastery level (\d+)/gi)) || masteryMax;
  const spellMastery = max(matches(last(magicClaw), /Mastery level (\d+)/gi)) || masteryMax;
  const field = (value, range, maxValue = 10000, min = 0, step = 1) => ({ value, range, max: maxValue, min, step });
  return {
    weaponMultipliers,
    shield: field(stat(shield, 'incPDD'), rounded(max(shields.map(item => scrolled(item, 'incPDD', shieldScroll)), 100))),
    physical: {
      primary: field(Math.min(1000, stat(sword, 'reqSTR')), 1000, 1000),
      secondary: field(Math.min(1000, stat(sword, 'reqDEX')), 1000, 1000),
      attack: field(Math.min(1000, stat(sword, 'incPAD')), 1000, 1000),
      power: field(0, rounded(Math.max(10, gearAttack + gloveBonus + buffAttack))),
      mult: field(weaponMultipliers.find(row => row[0] === '1H Sword')?.[1] ?? 1.8,
        max(weaponMultipliers.flatMap(row => row.slice(1)), 1), max(weaponMultipliers.flatMap(row => row.slice(1)), 1), 1, 0.1),
      mastery: field(physicalMastery, masteryMax, masteryMax),
      skill: field(Math.min(1000, max(matches(last(powerStrike), /Damage (\d+)%/g), 100)), 1000, 1000),
    },
    magical: {
      int: field(stat(wand, 'reqINT'), intRange),
      magicAttack: field(stat(wand, 'incMAD'), rounded(maxMagicAttack)),
      basic: field(max(matches(last(magicClaw), /Basic Attack (\d+)/g), 1), max(matches(lines, /Basic Attack (\d+)/g), 100)),
      mastery: field(spellMastery, masteryMax, masteryMax),
    },
    physicalSource: `${sword?.name ?? 'Sword'} equip requirements and attack; max-level Power Strike and Sword Mastery. Stat ranges are estimates, not player caps.`,
    magicalSource: `${wand?.name ?? 'Wand'} equip INT and Magic Attack; max-level Magic Claw. Stat ranges are estimates, not player caps.`,
    physicalExample: `Starting example: ${sword?.name ?? 'Sword'} minimum stats + Power Strike.`,
    magicalExample: `Starting example: ${wand?.name ?? 'Wand'} minimum INT + Magic Claw.`,
  };
}
