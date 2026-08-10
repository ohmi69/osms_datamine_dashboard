import { el, fmt, makeCollapsible, makeThumbnail, makeDeepLinkButton, parseIdFilter, makeMatcher, makePillGroup, wireSearch, toItemThumbPath, makeCopyableId, makeTabLink, padItemId, scrollToDetailRow, autoExpandById, showFilterBanner, hideFilterBanner, enableStickyTableHead } from '../lib/utils.js';
import { Router } from '../lib/Router.js';
import { attachTooltip } from '../lib/tooltip.js';

function filterDisciplines(disciplines, exactId, matcher) {
  return disciplines
    .map((discipline) => ({
      ...discipline,
      output_types: discipline.output_types
        .map((outputType) => ({
          ...outputType,
          levels: outputType.levels
            .map((level) => ({
              ...level,
              recipes: level.recipes.filter((recipe) =>
                exactId != null
                  ? recipe.output_id != null && Number(recipe.output_id) === exactId
                  : matcher.test(recipe.result_item_name) ||
                    recipe.ingredients.some((ing) => matcher.test(ing.item_name))
              ),
            }))
            .filter((level) => level.recipes.length > 0),
        }))
        .filter((outputType) => outputType.levels.length > 0),
    }))
    .filter((discipline) => discipline.output_types.length > 0);
}

// Craft level, craft exp needed to finish that level, character level needed to move on
// to it. Read out of the COT2 client: the exp column is GetCraftNeedEXP (sub_1401D2690),
// which takes only a level, so all six disciplines share it; the character level column
// is the 5 x nextLevel the crafting window prints in its own tooltip (sub_1410F6F80).
// Level 1 comes from the quest, so it has no character level of its own.
// See tmp/crafting-exp-table-binary.md.
const CRAFT_LEVELS = [
  [1, 50, null], [2, 166, 10], [3, 319, 15], [4, 521, 20], [5, 787, 25],
  [6, 1138, 30], [7, 1602, 35], [8, 2214, 40], [9, 3022, 45], [10, 4089, 50],
];

// Transposed: ten levels across the top, three short rows underneath. Laid out the
// other way round it is a narrow ten-row column that leaves most of the panel empty.
function buildCraftLevelTable() {
  const wrap = el('div', { className: 'craft-level-wrap' });

  const tableWrap = el('div', { className: 'table-scroll' });
  const table = el('table', { className: 'craft-level-table' });

  const thead = el('thead');
  const headRow = el('tr');
  headRow.appendChild(el('th', { className: 'craft-level-rowhead' }));
  CRAFT_LEVELS.forEach(([level]) => {
    const cell = el('th');
    cell.appendChild(el('span', { className: 'lvl-chip', textContent: `Lv ${level}` }));
    headRow.appendChild(cell);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  let accumulated = 0;
  const accumulatedByLevel = CRAFT_LEVELS.map(([, exp]) => {
    const before = accumulated;
    accumulated += exp;
    return before;
  });

  const ROWS = [
    ['XP to Level Up', ([, exp]) => fmt(exp), 'craft-level-xp'],
    ['Total XP Spent', (_, i) => fmt(accumulatedByLevel[i]), 'craft-num'],
    ['Character Level', ([, , charLevel]) => (charLevel === null ? '—' : `Lv ${charLevel}`), 'craft-num'],
  ];

  const tbody = el('tbody');
  ROWS.forEach(([label, value, cls]) => {
    const row = el('tr');
    row.appendChild(el('th', { className: 'craft-level-rowhead', textContent: label }));
    CRAFT_LEVELS.forEach((entry, i) => {
      row.appendChild(el('td', { className: cls, textContent: value(entry, i) }));
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  enableStickyTableHead(tableWrap, table);
  wrap.appendChild(tableWrap);

  return wrap;
}

export function renderCrafting(data, options = {}) {
  const { recipes, items } = data;
  const { onItemClick } = options;
  let searchQuery = '';
  let autoExpandAfterId = null;
  let selectedDiscipline = null; // null = all
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

  // Result/ingredient links point at the same tab and query main.js's
  // onItemClick would navigate to, so the href matches the in-page click.
  function makeItemLink(item, id, className) {
    const tab = item?.category === 'Equipment' ? 'equipment' : 'items';
    const target = id != null ? `id:${padItemId(id)}` : (item?.name || '');
    return makeTabLink(tab, target, {
      className,
      onActivate: () => onItemClick(item, id),
      stopPropagation: true,
    });
  }


  // Search and filters stay pinned at the top while the list scrolls past.
  const toolbar = el('div', { className: 'sticky-toolbar' });

  wireSearch(toolbar, 'Search by result or ingredient...', options, (query) => {
    searchQuery = query;
    renderData();
  }, (id) => {
    autoExpandAfterId = id;
    renderData();
  });

  const DISCIPLINE_PILLS = [
    { label: 'All', value: null },
    ...recipes.disciplines.map((discipline) => ({ label: discipline.discipline, value: discipline.discipline }))
  ];
  function updateFilterUrl() {
    Router.updateFilter('crafting', selectedDiscipline ? { discipline: selectedDiscipline } : {});
  }

  const pillGroup = makePillGroup(DISCIPLINE_PILLS, selectedDiscipline, (value) => {
    selectedDiscipline = value;
    hideFilterBanner();
    updateFilterUrl();
    renderData();
  });
  toolbar.appendChild(pillGroup);
  container.appendChild(toolbar);

  // Sits above the recipe lists and is deliberately outside renderData - the
  // requirements are identical for every discipline, so the pills do not touch it.
  container.appendChild(
    makeCollapsible('Craft Level Requirements', null, true, null, buildCraftLevelTable)
  );

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function renderData() {
    pillGroup.setActive(selectedDiscipline);
    dataDiv.innerHTML = '';
    const exactId = parseIdFilter(searchQuery);
    const matcher = makeMatcher(searchQuery);
    const source = selectedDiscipline
      ? recipes.disciplines.filter((d) => d.discipline === selectedDiscipline)
      : recipes.disciplines;
    const filtered = filterDisciplines(source, exactId, matcher);

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
          className: 'empty-state',
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

        const tableWrap = el('div', { className: 'table-scroll' });
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
            const resultWrap = el('div', { className: 'craft-result-wrap' });
            const resultItem = recipe.output_id != null
              ? itemById.get(String(recipe.output_id))
              : itemByName.get(recipe.result_item_name);
            const resultLeft = onItemClick
              ? makeItemLink(resultItem, recipe.output_id, 'craft-item craft-item--clickable')
              : el('div', { className: 'craft-item' });
            resultLeft.appendChild(
              makeThumbnail(toItemThumbPath(recipe.output_id), `${recipe.result_item_name} thumbnail`, {
                className: 'item-thumb',
                fallbackText: 'ITEM',
              })
            );
            resultLeft.appendChild(el('span', { className: 'craft-result-name', textContent: recipe.result_item_name }));
            attachTooltip(resultLeft, () => recipe.output_id != null ? itemById.get(String(recipe.output_id)) : itemByName.get(recipe.result_item_name));
            resultWrap.appendChild(resultLeft);
            if (recipe.output_id != null) {
              const craftIdWrap = el('span', { className: 'item-id-wrap' });
              craftIdWrap.appendChild(makeDeepLinkButton('crafting', padItemId(recipe.output_id)));
              craftIdWrap.appendChild(makeCopyableId(`#${padItemId(recipe.output_id)}`));
              resultWrap.appendChild(craftIdWrap);
            }
            resultCell.appendChild(resultWrap);
            row.appendChild(resultCell);
            if (recipe.output_id != null) {
              row.addEventListener('click', (e) => {
                if (e.target.closest('button, input')) return;
                history.replaceState(null, '', `#crafting?q=${encodeURIComponent('id:' + padItemId(recipe.output_id))}`);
                document.querySelectorAll('.row-hotlink').forEach(r => r.classList.remove('row-hotlink'));
                row.classList.add('row-hotlink');
                scrollToDetailRow(row, row);
              });
            }
            row.appendChild(
              el('td', { className: 'num craft-qty', textContent: recipe.result_count })
            );

            const ingCell = el('td', { className: 'craft-ingredients' });
            recipe.ingredients.forEach((ingredient, index) => {
              const ingredientId = itemNameToId.get(ingredient.item_name);
              const ingItem = itemByName.get(ingredient.item_name);
              const ingWrap = onItemClick
                ? makeItemLink(ingItem, ingredientId, 'craft-ing craft-ing--clickable')
                : el('span', { className: 'craft-ing' });
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
              ingCell.appendChild(ingWrap);
            });
            row.appendChild(ingCell);

            row.appendChild(
              el('td', { className: 'num hide-mobile craft-num', textContent: recipe.meso_cost > 0 ? fmt(recipe.meso_cost) : '—' })
            );
            row.appendChild(
              el('td', { className: 'num hide-mobile craft-num', textContent: recipe.craft_exp })
            );

            tbody.appendChild(row);
          });
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        enableStickyTableHead(tableWrap, table);
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

    if (autoExpandAfterId != null) {
      autoExpandById(dataDiv, autoExpandAfterId, 'tr');
      autoExpandAfterId = null;
    }
  }

  if (options.initialParams) {
    const discipline = options.initialParams.get('discipline');
    if (discipline) {
      selectedDiscipline = discipline;
      pillGroup.setActive(selectedDiscipline);
      updateFilterUrl();
      showFilterBanner(selectedDiscipline, () => {
        selectedDiscipline = null;
        pillGroup.setActive(null);
        updateFilterUrl();
        renderData();
      });
    }
  }

  renderData();
  return container;
}
