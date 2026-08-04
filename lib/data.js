
import { StateManager } from './StateManager.js';
const state = new StateManager('mscw-datamine-state');
export default state;

export function getDataBase() {
  const params = new URLSearchParams(window.location.search);
  const patch = params.get('patch');
  return patch ? `./data/patches/${encodeURIComponent(patch)}` : './data/current';
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
      npc_lookup: new Map(
        Object.entries(mapsRaw.npc_lookup ?? {}).map(([id, npc]) => [Number(id), npc])
      ),
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

let mapManifest = null;

async function loadMapManifest() {
  if (mapManifest) return mapManifest;
  const base = getDataBase();
  try {
    const res = await fetch(`${base}/map_manifest.json`);
    mapManifest = res.ok ? await res.json() : {};
  } catch {
    mapManifest = {};
  }
  return mapManifest;
}

export function getMapUrl(id) {
  const padded = String(id).padStart(9, '0');
  const hash = mapManifest?.[padded];
  return hash ? `./data/maps/${hash}.webp` : `${getDataBase()}/maps/${padded}.img.webp`;
}

export function getMobThumbUrl(hash) {
  return hash ? `./data/images/monsters/${hash}.png` : '';
}

export function getMobGifUrl(hash) {
  return hash ? `./data/images/monsters/${hash}.webp` : '';
}


// Tolerant: patch_notes.json only exists for datasets that have been diffed,
// so a 404 must not take down the whole site the way loadJson would.
export async function loadPatchNotes() {
  const base = getDataBase();
  try {
    const res = await fetch(`${base}/patch_notes.json`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function loadData() {
  const base = getDataBase();
  const [raw, , patchNotes] = await Promise.all([
    Promise.all([
      loadJson(`${base}/overview.json`),
      loadJson(`${base}/monsters.json`),
      loadJson(`${base}/maps.json`),
      loadJson(`${base}/skills.json`),
      loadJson(`${base}/crafting.json`),
      loadJson(`${base}/items.json`),
      loadJson(`${base}/quests.json`),
      loadJson(`${base}/cash_shop.json`),
      // Older patch snapshots have no beauty.json; the tab shows a fallback message.
      loadJson(`${base}/beauty.json`).catch(() => null),
    ]),
    loadMapManifest(),
    loadPatchNotes(),
  ]);
  const data = normalizeData(raw);
  data.patchNotes = patchNotes;
  return data;
}
