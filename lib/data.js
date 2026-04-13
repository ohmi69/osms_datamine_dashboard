export const STORAGE_KEY = 'mscw-datamine-state';

function getRaw() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function loadState() {
  const stored = getRaw();
  return {
    monsters: {
      cols: stored.monsters && stored.monsters.cols ? stored.monsters.cols : null,
    },
    showIds: stored.showIds === true,
    theme: stored.theme || 'mapletip',
  };
}

export function saveState(key, value) {
  try {
    const current = getRaw();
    if (key === 'monsters' && value && value.cols) {
      current.monsters = { cols: value.cols };
    } else if (key === 'showIds') {
      current.showIds = value;
    } else if (key === 'theme') {
      current.theme = value;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

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
    loadJson('./data/beauty_coupons.json'),
  ]);
  return normalizeData(raw);
}
