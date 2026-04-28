
import { StateManager } from './StateManager.js';
const state = new StateManager('mscw-datamine-state');
export default state;

export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export function normalizeData(raw) {
  const [
    overviewRaw,
    monstersRaw,
    mapsRaw,
    skillsRaw,
    recipesRaw,
    itemsRaw,
    questsRaw,
    cashShopRaw,
    beautyCouponsRaw,
  ] = raw;

  return {
    overview: overviewRaw,
    monsters: monstersRaw,
    maps: {
      ...mapsRaw,
      total:
        typeof mapsRaw.total === 'number'
          ? mapsRaw.total
          : mapsRaw.regions.reduce((sum, region) => sum + (region.count || 0), 0),
    },
    skills: {
      ...skillsRaw,
      total:
        typeof skillsRaw.total === 'number'
          ? skillsRaw.total
          : skillsRaw.classes.reduce((sum, cls) => sum + cls.skills.length, 0),
    },
    recipes: recipesRaw,
    items: itemsRaw,
    quests: {
      ...questsRaw,
      regions:
        Array.isArray(questsRaw.regions) && questsRaw.regions.length
          ? questsRaw.regions
          : [...new Set((questsRaw.quests || []).map((quest) => quest.region).filter(Boolean))],
    },
    cashShop: cashShopRaw,
    beauty_coupons: beautyCouponsRaw,
  };
}

let npcLookup = null;
export async function getNpcLookup() {
  if (npcLookup) return npcLookup;
  const res = await fetch('data/npcs.json');
  const npcsData = await res.json();
  npcLookup = new Map();
  for (const npc of npcsData) {
    npcLookup.set(Number(npc.id), npc);
  }
  return npcLookup;
}

export async function loadData() {
  const raw = await Promise.all([
    loadJson('./data/overview.json'),
    loadJson('./data/monsters.json'),
    loadJson('./data/maps.json'),
    loadJson('./data/skills.json'),
    loadJson('./data/crafting.json'),
    loadJson('./data/items.json'),
    loadJson('./data/quests.json'),
    loadJson('./data/cash_shop.json'),
    loadJson('./data/beauty.json'),
  ]);
  return normalizeData(raw);
}
