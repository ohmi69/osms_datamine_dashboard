import { el, fmt, makeSearchBox, makeCollapsible, makeThumbnail, makeDeepLinkButton } from '../lib/utils.js';
import { attachTooltip } from '../lib/tooltip.js';

function parseIdFilter(query) {
  const match = /^id\s*:\s*(\d+)\s*$/i.exec((query || '').trim());
  if (!match) return null;
  return Number(match[1]);
}

function toItemThumbPath(itemId) {
  const n = Number(itemId);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `images/items/${String(n).padStart(8, '0')}.png`;
}

export function renderCrafting(data, options = {}) {
  const { recipes, items } = data;
  const { onItemClick } = options;
  let searchQuery = '';
  const container = el('div');

  const itemNameToId = new Map();
  const itemByName = new Map();
  [...(items?.items || []), ...(items?.scrolls || [])].forEach((item) => {
    if (!item?.name || !item?.id) return;
    if (!itemNameToId.has(item.name)) itemNameToId.set(item.name, item.id);
    if (!itemByName.has(item.name)) itemByName.set(item.name, item);
  });
  const itemById = new Map();
  [...(items?.items || []), ...(items?.scrolls || [])].forEach((item) => {
    if (item?.id != null) itemById.set(String(item.id), item);
  });


  const craftSearchBox = makeSearchBox('Search by result or ingredient...', (value) => {
    searchQuery = value;
    renderData();
  });
  container.appendChild(craftSearchBox);

  if (options.setNavigate) {
    options.setNavigate((query) => {
      searchQuery = query;
      craftSearchBox._input.value = query;
      renderData();
      window.scrollTo(0, 0);
    });
  }

  // Pills (quest-style toggles)
  const pillRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '16px 0 8px 0', alignItems: 'center' } });
  const allTab = el('button', { className: 'pill active', textContent: 'All' });
  pillRow.appendChild(allTab);
  const disciplineTabs = recipes.disciplines.map((discipline) => {
    const btn = el('button', { className: 'pill', textContent: discipline.discipline });
    pillRow.appendChild(btn);
    return btn;
  });
  container.appendChild(pillRow);

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  let selectedDiscipline = null; // null = all

  function renderData() {
    dataDiv.innerHTML = '';
    const exactId = parseIdFilter(searchQuery);
    const sq = searchQuery.toLowerCase();
    let filtered;
    if (!selectedDiscipline) {
      filtered = recipes.disciplines
        .map((discipline) => ({
          ...discipline,
          output_types: discipline.output_types
            .map((outputType) => ({
              ...outputType,
              levels: outputType.levels
                .map((level) => ({
                  ...level,
                  recipes: level.recipes.filter(
                    (recipe) =>
                      exactId != null
                        ? recipe.output_id != null && Number(recipe.output_id) === exactId
                        : !sq ||
                          recipe.result_item_name.toLowerCase().includes(sq) ||
                          recipe.ingredients.some((ingredient) =>
                            ingredient.item_name.toLowerCase().includes(sq)
                          )
                  ),
                }))
                .filter((level) => level.recipes.length > 0),
            }))
            .filter((outputType) => outputType.levels.length > 0),
        }))
        .filter((discipline) => discipline.output_types.length > 0);
    } else {
      filtered = recipes.disciplines
        .filter((discipline) => discipline.discipline === selectedDiscipline)
        .map((discipline) => ({
          ...discipline,
          output_types: discipline.output_types
            .map((outputType) => ({
              ...outputType,
              levels: outputType.levels
                .map((level) => ({
                  ...level,
                  recipes: level.recipes.filter(
                    (recipe) =>
                      exactId != null
                        ? recipe.output_id != null && Number(recipe.output_id) === exactId
                        : !sq ||
                          recipe.result_item_name.toLowerCase().includes(sq) ||
                          recipe.ingredients.some((ingredient) =>
                            ingredient.item_name.toLowerCase().includes(sq)
                          )
                  ),
                }))
                .filter((level) => level.recipes.length > 0),
            }))
            .filter((outputType) => outputType.levels.length > 0),
        }))
        .filter((discipline) => discipline.output_types.length > 0);
    }

    const totalRecipes = filtered.reduce(
      (sum, discipline) =>
        sum +
        discipline.output_types.reduce(
          (outputSum, outputType) =>
            outputSum +
            outputType.levels.reduce((levelSum, level) => levelSum + level.recipes.length, 0),
          0
        ),
      0
    );

    dataDiv.appendChild(
      el('div', { className: 'count-text', textContent: `${totalRecipes} recipes` })
    );

    if (totalRecipes === 0) {
      dataDiv.appendChild(
        el('p', {
          style: { color: 'var(--dim)', padding: '20px', textAlign: 'center' },
          textContent: 'No recipes match your filters.',
        })
      );
      return;
    }

    filtered.forEach((discipline) => {
      const disciplineRecipes = discipline.output_types.reduce(
        (sum, outputType) =>
          sum + outputType.levels.reduce((levelSum, level) => levelSum + level.recipes.length, 0),
        0
      );

      const content = el('div');
      discipline.output_types.forEach((outputType) => {
        const outputRecipes = outputType.levels.reduce(
          (sum, level) => sum + level.recipes.length,
          0
        );

        const tableWrap = el('div', { style: { overflowX: 'auto' } });
        const table = el('table', { className: 'craft-table' });
        const colgroup = el('colgroup');
        ['result', 'qty', 'ingredients', 'cost', 'xp'].forEach((cls) => {
          colgroup.appendChild(el('col', { className: cls }));
        });
        table.appendChild(colgroup);

        const thead = el('thead');
        const headRow = el('tr');
        headRow.appendChild(el('th', { textContent: 'Result' }));
        headRow.appendChild(el('th', { className: 'num', textContent: 'Qty' }));
        headRow.appendChild(el('th', { textContent: 'Ingredients' }));
        headRow.appendChild(el('th', { className: 'num hide-mobile', textContent: 'Cost' }));
        headRow.appendChild(el('th', { className: 'num hide-mobile', textContent: 'XP' }));
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = el('tbody');
        outputType.levels.forEach((level) => {
          const levelRow = el('tr', { className: 'level-header' });
          levelRow.appendChild(el('td', { colSpan: '5', textContent: `Level ${level.level}` }));
          tbody.appendChild(levelRow);

          level.recipes.forEach((recipe) => {
            const row = el('tr');
            const resultCell = el('td');
            const resultWrap = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' } });
            const resultLeft = el('div', { className: 'craft-item' });
            resultLeft.appendChild(
              makeThumbnail(toItemThumbPath(recipe.output_id), `${recipe.result_item_name} thumbnail`, {
                className: 'item-thumb',
                fallbackText: 'ITEM',
              })
            );
            resultLeft.appendChild(el('span', { style: { fontWeight: '500' }, textContent: recipe.result_item_name }));
            attachTooltip(resultLeft, () => recipe.output_id != null ? itemById.get(String(recipe.output_id)) : itemByName.get(recipe.result_item_name));
            if (onItemClick) {
              resultLeft.style.cursor = 'pointer';
              resultLeft.addEventListener('click', () => {
                const item = recipe.output_id != null ? itemById.get(String(recipe.output_id)) : itemByName.get(recipe.result_item_name);
                onItemClick(item, recipe.output_id);
              });
            }
            resultWrap.appendChild(resultLeft);
            if (recipe.output_id != null) {
              const craftIdWrap = el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } });
              craftIdWrap.appendChild(makeDeepLinkButton('crafting', recipe.output_id));
              craftIdWrap.appendChild(el('span', { className: 'id', textContent: recipe.output_id }));
              resultWrap.appendChild(craftIdWrap);
            }
            resultCell.appendChild(resultWrap);
            row.appendChild(resultCell);
            row.appendChild(
              el('td', {
                className: 'num',
                style: { color: 'var(--secondary)' },
                textContent: recipe.result_count,
              })
            );

            const ingCell = el('td', { className: 'craft-ingredients' });
            recipe.ingredients.forEach((ingredient, index) => {
              const ingWrap = el('span', { className: 'craft-ing' });
              const ingredientId = itemNameToId.get(ingredient.item_name);
              ingWrap.appendChild(
                makeThumbnail(toItemThumbPath(ingredientId), `${ingredient.item_name} thumbnail`, {
                  className: 'item-thumb',
                  fallbackText: 'ITEM',
                })
              );
              ingWrap.appendChild(
                el('span', {
                  className: 'craft-ing-text',
                  textContent: `${ingredient.count}x ${ingredient.item_name}`,
                })
              );
              attachTooltip(ingWrap, () => itemByName.get(ingredient.item_name));
              if (onItemClick) {
                ingWrap.style.cursor = 'pointer';
                ingWrap.addEventListener('click', () => {
                  const item = itemByName.get(ingredient.item_name);
                  onItemClick(item, ingredientId);
                });
              }
              ingCell.appendChild(ingWrap);
              if (index < recipe.ingredients.length - 1) {
                ingCell.appendChild(el('span', { className: 'craft-ing-sep', textContent: '·' }));
              }
            });
            row.appendChild(ingCell);

            row.appendChild(
              el('td', {
                className: 'num hide-mobile',
                style: { fontSize: '13px', color: 'var(--dim)' },
                textContent: recipe.meso_cost > 0 ? fmt(recipe.meso_cost) : '—',
              })
            );
            row.appendChild(
              el('td', {
                className: 'num hide-mobile',
                style: { fontSize: '13px', color: 'var(--dim)' },
                textContent: recipe.craft_exp,
              })
            );

            tbody.appendChild(row);
          });
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        content.appendChild(makeCollapsible(outputType.output_type, outputRecipes, true, null, tableWrap));
      });

      dataDiv.appendChild(
        makeCollapsible(
          discipline.discipline,
          disciplineRecipes,
          true,
          null,
          content
        )
      );
    });
  }

  // Tab event listeners
  allTab.addEventListener('click', () => {
    selectedDiscipline = null;
    allTab.classList.add('active');
    disciplineTabs.forEach((btn) => btn.classList.remove('active'));
    renderData();
  });
  disciplineTabs.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      selectedDiscipline = recipes.disciplines[idx].discipline;
      allTab.classList.remove('active');
      disciplineTabs.forEach((b, i) => b.classList.toggle('active', i === idx));
      btn.classList.add('active');
      disciplineTabs.forEach((b, i) => { if (i !== idx) b.classList.remove('active'); });
      renderData();
    });
  });

  renderData();
  return container;
}
