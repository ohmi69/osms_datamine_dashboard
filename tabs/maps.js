
import { renderMapBrowser } from './maps/MapBrowser.js';

export function renderMaps(data, options = {}) {
  const { maps, monsters } = data;

  // Build reverse lookup: mapId -> sorted mob list
  const mapMobs = new Map();
  if (monsters?.monsters) {
    for (const mob of monsters.monsters) {
      if (!mob.maps) continue;
      for (const m of mob.maps) {
        if (!mapMobs.has(m.id)) mapMobs.set(m.id, []);
        mapMobs.get(m.id).push({
          id: mob.id,
          name: mob.name,
          thumbnail: mob.thumbnail,
          count: m.count,
          exp: mob.exp || 0,
          mobTime: m.mob_time ?? null,
          level: mob.level ?? 0,
        });
      }
    }
    for (const mobs of mapMobs.values()) {
      mobs.sort((a, b) => b.count - a.count);
    }
  }

  // Expose for tooltip.js
  window._allMapsCache = maps;
  window._mapMobsCache = {};
  for (const [k, v] of mapMobs.entries()) {
    window._mapMobsCache[String(k)] = v;
  }

  return renderMapBrowser(data, mapMobs, options);
}
