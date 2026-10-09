import { el, makeTabLink } from '../lib/utils.js';
import { getDataBase, getMapUrl, getMobGifUrl, getMobThumbUrl } from '../lib/data.js';
import { renderGlobalSearch } from '../lib/global-search.js';

const WELCOME_MOB_MAX_HEIGHT = 98;
const WELCOME_MOB_SPEED = 55;

// Field guide: players find a destination first, then explore the full data.
// Existing theme surfaces provide depth; the game art supplies the color.
function appendMonsterTrail(banner, images) {
  if (images.length) {
    const track = el('div', { className: 'overview-welcome__monster-track' });
    const stage = el('div', { className: 'overview-welcome__monster-stage' });
    const procession = el('div', {
      className: 'overview-welcome__procession',
      style: { visibility: 'hidden', animationPlayState: 'paused' },
    });
    const bounces = new WeakMap();
    let processionSpeed = 1;
    const bounceMob = image => {
      processionSpeed += 0.15;
      procession.getAnimations().forEach(animation => animation.updatePlaybackRate(processionSpeed));
      const previous = bounces.get(image);
      const startTransform = getComputedStyle(image).transform;
      const height = Math.min((previous?.height || 8) + 20, window.innerHeight - image.naturalHeight - 4);
      image.getAnimations().forEach(animation => animation.cancel());
      const animation = image.animate([
        { transform: startTransform === 'none' ? 'translateY(0)' : startTransform, easing: 'ease-out' },
        { transform: `translateY(-${height}px)`, offset: 0.4, easing: 'ease-in' },
        { transform: 'translateY(0)', offset: 0.8, easing: 'ease-out' },
        { transform: 'translateY(-6px)', offset: 0.9, easing: 'ease-in' },
        { transform: 'translateY(0)' },
      ], { duration: 600 + height * 2 });
      bounces.set(image, { height, animation });
      animation.onfinish = () => {
        if (bounces.get(image)?.animation === animation) bounces.delete(image);
      };
    };
    // Delegate events so the duplicated row is interactive too.
    procession.addEventListener('click', event => {
      if (event.target.matches('img')) bounceMob(event.target);
    });
    procession.addEventListener('keydown', event => {
      if (event.target.matches('img') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        bounceMob(event.target);
      }
    });
    const monsters = el('div', {
      className: 'overview-welcome__monsters',
    });
    images.forEach(({ src, alt }) => monsters.appendChild(el('img', {
      src,
      alt,
      role: 'button',
      tabindex: 0,
      title: 'Click to bounce and speed up all mobs; keep clicking to jump higher',
      draggable: false,
      style: { display: 'block', imageRendering: 'pixelated' },
    })));
    procession.appendChild(monsters);
    stage.appendChild(procession);
    track.appendChild(stage);
    banner.appendChild(track);
    // Resolve natural sizes before duplicating the row so both halves match exactly.
    Promise.all([...monsters.children].map(async image => {
      try {
        await image.decode();
        if (image.naturalHeight > WELCOME_MOB_MAX_HEIGHT) image.remove();
      } catch {
        image.remove();
      }
    })).then(() => {
      if (!monsters.children.length) {
        track.remove();
        return;
      }
      const shuffled = [...monsters.children];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      monsters.replaceChildren(...shuffled);
      const rowWidth = [...monsters.children].reduce((width, image) => width + image.naturalWidth + 20, 0);
      procession.style.animationDuration = `${rowWidth / WELCOME_MOB_SPEED}s`;
      const nextMonsters = monsters.cloneNode(true);
      nextMonsters.setAttribute('aria-hidden', 'true');
      nextMonsters.querySelectorAll('img').forEach(image => image.setAttribute('tabindex', '-1'));
      procession.appendChild(nextMonsters);
      procession.style.visibility = 'visible';
      procession.style.removeProperty('animation-play-state');
    });
  }
}

function art(src, className = '') {
  const image = el('img', { src, alt: '', className, draggable: false });
  image.addEventListener('error', () => image.remove(), { once: true });
  return image;
}

function buildArtwork(data) {
  const base = getDataBase();
  const item = id => `${base}/images/items/${String(id).padStart(8, '0')}.png`;
  const mob = name => {
    const record = data.monsters.monsters.find(m => m.name === name);
    return record?.gif ? getMobGifUrl(record.gif)
      : record?.thumbnail ? getMobThumbUrl(record.thumbnail) : '';
  };
  const skills = Object.values(data.skills).flat()
    .filter(cls => cls?.skills).flatMap(cls => cls.skills)
    .filter(skill => skill.thumbnail);
  const skillIcons = skills.filter(skill => /Magic Claw|Power Strike|Lucky Seven/.test(skill.name))
    .slice(0, 3).map(skill => `${base}/${skill.thumbnail}`);
  const npcs = [...(data.maps.npc_lookup?.values() || [])];
  const npc = npcs.find(n => /Heena|Maple Administrator/.test(n.name)) || npcs[0];
  const mapMarkIcons = data.maps.map_mark_icons || {};
  const mapIcon = mark => mapMarkIcons[mark] ? `${base}/${mapMarkIcons[mark]}` : '';
  const cashItems = (data.cashShop?.categories || []).flatMap(c => c.items || []);
  const itemRecords = data.items?.items || [];
  const rotationPools = {
    maps: Object.keys(mapMarkIcons).map(mapIcon),
    monsters: data.monsters.monsters.filter(record => record.gif).map(record => getMobGifUrl(record.gif)),
    quests: npcs.filter(record => record.thumbnail).map(record => `${base}/${record.thumbnail}`),
    skills: skills.map(skill => `${base}/${skill.thumbnail}`),
    items: itemRecords.filter(record => record.category !== 'Equipment').map(record => item(record.id)),
    equipment: itemRecords.filter(record => record.category === 'Equipment').map(record => item(record.id)),
    cashshop: cashItems.filter(record => record.thumbnail).map(record => `${base}/${record.thumbnail}`),
  };
  const pet = cashItems.find(i => i.category === 'Pet' && i.id >= 5000000 && i.id < 5010000 && i.thumbnail)
    || cashItems.find(i => i.thumbnail);
  const itemsByName = new Map((data.items?.items || []).map(record => [record.name, record]));
  const recipes = (data.recipes?.disciplines || []).flatMap(discipline =>
    discipline.output_types.flatMap(type => type.levels.flatMap(level => level.recipes)));
  // Compact recipes fit the smallest cards without hiding any ingredients.
  const craftingRecipes = recipes.filter(record => record.ingredients.length > 0
    && record.ingredients.length <= 2
    && record.ingredients.every(ingredient => itemsByName.has(ingredient.item_name)))
    .map(recipe => ({
      ingredients: recipe.ingredients.map(ingredient => ({
        name: ingredient.item_name,
        count: ingredient.count,
        src: item(itemsByName.get(ingredient.item_name).id),
      })),
      result: { name: recipe.result_item_name, count: recipe.result_count, src: item(recipe.output_id) },
    }));
  const craftingRecipe = craftingRecipes[Math.floor(Math.random() * craftingRecipes.length)];
  return {
    monsters: [mob('Orange Mushroom'), mob('Slime'), mob('Snail')].filter(Boolean),
    maps: ['Henesys', 'Ellinia', 'Perion'].map(mapIcon).filter(Boolean),
    skills: skillIcons,
    crafting: [item(4010101), item(4010102), item(4003006)],
    craftingRecipe,
    craftingRecipes,
    rotationPools,
    items: [item(2000000), item(2000001), item(2040000)],
    equipment: [item(1302000), item(1082000), item(1092002)],
    cashshop: pet ? [`${base}/${pet.thumbnail}`, item(5150000), item(5180000)] : [item(5150000), item(5180000), item(5151000)],
    quests: npc?.thumbnail ? [`${base}/${npc.thumbnail}`,
      ...npcs.filter(record => record !== npc && record.thumbnail).slice(0, 2).map(record => `${base}/${record.thumbnail}`)] : [],
  };
}

// Three clipped reels keep the card still while their artwork rolls vertically.
// Decode replacements before spinning, and release timers when Overview closes.
function appendRotatingArtwork(visual, initial, sources, monsterArtwork = false) {
  const pool = [...new Set([...initial, ...sources].filter(Boolean))];
  if (!pool.length) return;
  // Shuffle once for this render so a refresh starts with a fresh assortment.
  const startingPool = [...pool];
  for (let i = startingPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [startingPool[i], startingPool[j]] = [startingPool[j], startingPool[i]];
  }
  const machine = el('div', {
    className: `artwork-slots${monsterArtwork ? ' artwork-slots--monsters' : ''}`,
  });
  const makeFrame = image => {
    const frame = el('div', { className: 'artwork-slots__frame' }, image);
    return frame;
  };
  const reels = Array.from({ length: 3 }, (_, index) => {
    const slot = el('div', { className: 'artwork-slots__slot' });
    const track = el('div', { className: 'artwork-slots__track' });
    const src = startingPool[index % startingPool.length];
    track.appendChild(makeFrame(art(src)));
    slot.appendChild(track);
    machine.appendChild(slot);
    return { track, src };
  });
  visual.appendChild(machine);
  const failed = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = null;
  let disposed = false;
  let spinning = false;
  const pick = excluded => {
    const available = pool.filter(src => !failed.has(src) && !excluded.has(src));
    return available.length ? available[Math.floor(Math.random() * available.length)] : null;
  };
  const roll = async () => {
    if (disposed || spinning || document.hidden || !machine.isConnected) return;
    spinning = true;
    try {
      const excluded = new Set(reels.map(reel => reel.src));
      const next = reels.map(() => {
        const src = pick(excluded);
        if (src) excluded.add(src);
        return src;
      });
      const images = await Promise.all(next.map(async src => {
        if (!src) return null;
        const image = art(src);
        try { await image.decode(); return image; }
        catch { failed.add(src); return null; }
      }));
      if (disposed || !machine.isConnected) return;
      await Promise.all(reels.map(async (reel, index) => {
        const image = images[index];
        if (!image) return;
        const frame = makeFrame(image);
        if (!reducedMotion.matches) {
          const intermediate = Array.from({ length: 3 }, (_, step) =>
            makeFrame(art(reels[(index + step + 1) % reels.length].src)));
          reel.track.append(...intermediate, frame);
          const animation = reel.track.animate([
            { transform: 'translateY(0)' },
            { transform: 'translateY(-80%)' },
          ], { duration: 780 + index * 140, easing: 'cubic-bezier(.15,.65,.2,1)', fill: 'forwards' });
          try { await animation.finished; } catch { return; }
          animation.cancel();
        }
        if (disposed) return;
        reel.track.replaceChildren(frame);
        reel.src = next[index];
      }));
    } finally { spinning = false; }
  };
  let wasConnected = false;
  const observer = new MutationObserver(() => {
    if (machine.isConnected) {
      if (!wasConnected) {
        wasConnected = true;
        timer = window.setInterval(roll, 5000);
      }
    } else if (wasConnected) {
      disposed = true;
      window.clearInterval(timer);
      reels.forEach(reel => reel.track.getAnimations().forEach(animation => animation.cancel()));
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function buildCraftingPreview(recipe) {
  const flow = el('div', { className: 'crafting-preview', 'data-result': recipe.result.name });
  const ingredientIcons = el('div', { className: 'crafting-preview__ingredients' });
  const icon = record => {
    const image = art(record.src);
    image.title = `${record.count} × ${record.name}`;
    return el('span', { className: 'crafting-preview__item' }, image);
  };
  recipe.ingredients.forEach((ingredient, index) => {
    if (index) ingredientIcons.appendChild(el('span', { className: 'crafting-preview__plus', textContent: '+' }));
    ingredientIcons.appendChild(icon(ingredient));
  });
  flow.append(ingredientIcons,
    el('span', { className: 'crafting-preview__arrow', textContent: '→' }),
    el('span', { className: 'crafting-preview__result' }, icon(recipe.result)));
  return flow;
}

function appendCraftingArtwork(visual, artwork) {
  let recipe = artwork.craftingRecipe;
  if (!recipe) {
    artwork.crafting.forEach(src => visual.appendChild(art(src)));
    return;
  }
  const reel = el('div', { className: 'crafting-preview-reel' });
  const track = el('div', { className: 'crafting-preview-reel__track' });
  const frame = record => el('div', { className: 'crafting-preview-reel__frame' }, buildCraftingPreview(record));
  track.appendChild(frame(recipe));
  reel.appendChild(track);
  visual.appendChild(reel);
  const failed = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = null;
  let disposed = false;
  let spinning = false;
  const roll = async () => {
    if (disposed || spinning || document.hidden || !reel.isConnected) return;
    const candidates = artwork.craftingRecipes.filter(candidate => candidate.result.src !== recipe.result.src && !failed.has(candidate));
    if (!candidates.length) return;
    spinning = true;
    try {
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      const nextFrame = frame(next);
      try {
        await Promise.all([...nextFrame.querySelectorAll('img')].map(image => image.decode()));
      } catch {
        failed.add(next);
        return;
      }
      if (disposed || !reel.isConnected) return;
      if (!reducedMotion.matches) {
        // Roll complete recipes together so ingredients always match the result.
        track.append(nextFrame.cloneNode(true), frame(recipe), nextFrame);
        const animation = track.animate([
          { transform: 'translateY(0)' },
          { transform: 'translateY(-75%)' },
        ], { duration: 1000, easing: 'cubic-bezier(.15,.65,.2,1)', fill: 'forwards' });
        try { await animation.finished; } catch { return; }
        animation.cancel();
      }
      if (disposed) return;
      track.replaceChildren(nextFrame);
      recipe = next;
    } finally { spinning = false; }
  };
  let wasConnected = false;
  const observer = new MutationObserver(() => {
    if (reel.isConnected) {
      if (!wasConnected) {
        wasConnected = true;
        timer = window.setInterval(roll, 5000);
      }
    } else if (wasConnected) {
      disposed = true;
      window.clearInterval(timer);
      track.getAnimations().forEach(animation => animation.cancel());
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function tabLink(tabId, options, className, text = '', target = null) {
  const link = makeTabLink(tabId, target, {
    className,
    onActivate: () => options.switchTab(tabId, true, target),
  });
  link.textContent = text;
  return link;
}

function buildHero(data, options, historical) {
  const meta = data.patchMeta;
  const version = meta?.label || meta?.version
    || new URLSearchParams(window.location.search).get('patch') || 'Historical snapshot';
  const hero = el('section', {
    className: `field-guide-hero${historical ? ' field-guide-hero--historical' : ''}`,
    'aria-labelledby': 'field-guide-title',
  });
  if (!historical) {
    const backdrop = el('div', { className: 'field-guide-hero__backdrop-wrap', 'aria-hidden': 'true' });
    backdrop.appendChild(art(getMapUrl(10002091), 'field-guide-hero__backdrop'));
    hero.appendChild(backdrop);
  }
  const copy = el('div', { className: 'field-guide-hero__copy' },
    el('h1', { id: 'field-guide-title', textContent: historical ? `Explore ${version}` : 'Welcome back.\nA new adventure awaits.' }),
    el('p', { textContent: historical
      ? 'Take a walk through memory lane.'
      : 'MapleStory Classic World is (finally) out' }),
  );
  hero.appendChild(copy);
  if (!historical) {
    const trail = el('div', { className: 'field-guide-hero__trail' });
    appendMonsterTrail(trail, data.monsters.monsters
      .filter(monster => monster.id >= 1 && monster.id <= 1096 && monster.gif)
      .sort((a, b) => a.id - b.id)
      .map(monster => ({ src: getMobGifUrl(monster.gif), alt: `MapleStory ${monster.name}` })));
    hero.appendChild(trail);
  }
  const search = el('div', { className: 'field-guide-hero__search' },
    renderGlobalSearch(options.searchIndex || []));
  hero.appendChild(search);
  return hero;
}

function buildRelease(options, data) {
  const row = el('div', { className: 'field-guide-release' },
    el('span', { className: 'field-guide-release__badge', textContent: 'Public Release' }),
    el('span', { textContent: 'Updated October 8, 2026 · 19:38 PT' }));
  if (data.patchNotes) row.appendChild(tabLink('patchnotes', options, '', 'Patch notes →'));
  const details = el('details', { className: 'field-guide-release__details' },
    el('summary', { textContent: 'About this data' }),
    el('div', { className: 'field-guide-release__disclosure' },
      el('p', { textContent: 'Extracted directly from the game client. Content may be cut, delayed, or changed and is not guaranteed to appear in game.' }),
      el('p', {}, 'Client hash: ', el('code', { textContent: '71eb67bc' })),
    ));
  row.appendChild(details);
  return row;
}

function sectionHeader(title, subtitle) {
  return el('div', { className: 'field-guide-section-head' },
    el('h2', { textContent: title }), el('p', { textContent: subtitle }));
}

function buildNavSection(stats, options, artwork, historical) {
  const section = el('section', { className: 'field-guide-explore', 'aria-label': 'Explore the datamine' },
    sectionHeader('How does your story begin?', ''));
  const grid = el('div', { className: 'nav-grid' });
  [
    ['monsters', 'Monsters', stats.monsters, '', 'monsters'],
    ['maps', 'Maps', stats.maps, ``, 'maps'],
    ['skills', 'Jobs', stats.skills, '', 'skills'],
    !historical ? ['crafting', 'Crafting', stats.recipes, '', 'recipes'] : null,
    ['items', 'Items', stats.scrolls + stats.consumables + stats.etc + stats.setup, '', 'items'],
    ['equipment', 'Equipment', stats.equipment, '', 'pieces'],
    ['cashshop', 'Cash Shop', stats.cash_shop_items, '', 'items'],
    ['quests', 'Quests', stats.quests, '', 'quests'],
  ].filter(Boolean).forEach(([tabId, label, count, desc, unit]) => {
    const card = tabLink(tabId, options, `nav-card nav-card--${tabId}`);
    const visual = el('div', { className: 'nav-card__art', 'aria-hidden': 'true' });
    if (tabId === 'crafting') appendCraftingArtwork(visual, artwork);
    else if (artwork.rotationPools[tabId]) appendRotatingArtwork(
      visual, artwork[tabId], artwork.rotationPools[tabId], tabId === 'monsters');
    else (artwork[tabId] || []).forEach(src => visual.appendChild(art(src)));
    card.append(visual,
      el('div', { className: 'nav-card__body' },
        el('div', { className: 'nav-label', textContent: label }),
        el('div', { className: 'nav-desc', textContent: desc }),
        el('div', { className: 'nav-count', textContent: `${Number(count || 0).toLocaleString()} ${unit}` })),
      el('span', { className: 'nav-card__arrow', textContent: '↗', 'aria-hidden': 'true' }));
    grid.appendChild(card);
  });
  section.appendChild(grid);
  return section;
}

export function renderOverview(data, options) {
  const stats = data.overview.stats;
  const historical = getDataBase() !== './data/current';
  const artwork = buildArtwork(data);
  const page = el('div', { className: 'field-guide' });
  if (!historical) page.appendChild(buildRelease(options, data));
  page.appendChild(buildHero(data, options, historical));
  page.appendChild(buildNavSection(stats, options, artwork, historical));
  if (!historical) {
    page.appendChild(tabLink('portal-runner', options, 'field-guide-game',
      'Take the scenic route · Play Portal Runner →'));
    page.appendChild(el('p', { className: 'field-guide-footnote', textContent:
      'A peek into the game files. Content may change.' }));
  }
  return page;
}
