export const CHAIN_COLORS = [
  '#f59e0b', '#3b82f6', '#22c55e', '#a855f7',
  '#ec4899', '#14b8a6', '#eab308', '#ef4444',
];

export const MOB_STATE_ORDER = ['stand', 'move', 'fly', 'jump', 'attack1', 'attack2', 'attack3', 'skill1', 'hit1', 'die1'];

export const MOB_STATE_LABEL = {
  stand: 'Stand', move: 'Move', fly: 'Fly', jump: 'Jump',
  attack1: 'Atk 1', attack2: 'Atk 2', attack3: 'Atk 3',
  skill1: 'Skill', hit1: 'Hit', die1: 'Die',
};

// Elemental attributes. The emoji identifies the element at a glance so a mob's
// weakness can be spotted without reading the badge text.
export const ELEMENT_META = {
  Fire:      { emoji: '🔥', order: 0 },
  Ice:       { emoji: '❄️', order: 1 },
  Lightning: { emoji: '⚡', order: 2 },
  Poison:    { emoji: '☠️', order: 3 },
  Holy:      { emoji: '✨', order: 4 },
};

// `Strong` is the raw elemAttr level-2 name; it reads as if the attack is
// strong, when it means the opposite, so the UI labels it "Resistant".
const ELEMENT_EFFECT_META = {
  Weak:   { cls: 'weak',   label: 'Weak',      order: 0, hint: 'takes extra damage from' },
  Immune: { cls: 'immune', label: 'Immune',    order: 1, hint: 'takes no damage from' },
  Strong: { cls: 'strong', label: 'Resistant', order: 2, hint: 'takes reduced damage from' },
  Resist: { cls: 'resist', label: 'Resistant', order: 2, hint: 'takes reduced damage from' },
};

/**
 * Normalize a mob's `elements` map into badge-ready descriptors, sorted
 * weaknesses first (then immunities, then resistances) so the most useful
 * entry is always the leftmost badge.
 */
export function describeElements(elements) {
  if (!elements || typeof elements !== 'object') return [];
  return Object.entries(elements)
    .map(([name, effect]) => {
      const meta = ELEMENT_EFFECT_META[effect]
        || { cls: '', label: effect, order: 3, hint: 'is affected normally by' };
      const emoji = ELEMENT_META[name]?.emoji || '';
      return {
        name,
        effect: meta.label,
        emoji,
        cls: meta.cls,
        title: `${meta.label}: ${meta.hint} ${name} attacks`,
        _sort: [meta.order, ELEMENT_META[name]?.order ?? 9],
      };
    })
    .sort((a, b) => (a._sort[0] - b._sort[0]) || (a._sort[1] - b._sort[1]));
}
