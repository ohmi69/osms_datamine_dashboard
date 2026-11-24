// Compose a chronological chain of consecutive patch-notes JSON objects into a
// single net diff (From -> To) client-side, cancelling out intermediate edits
// that were later reverted.

const BUCKETS = ['added', 'removed', 'changed'];

const normWs = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

function sameScalar(a, b, isLong = false) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (isLong) return normWs(a) === normWs(b);
  return String(a) === String(b);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function fieldKey(field) {
  return `${field.field ?? ''}\0${field.label ?? ''}`;
}

function hasMembers(field) {
  return Boolean(field.added?.length || field.removed?.length);
}

function chipIdKey(item) {
  if (item && typeof item === 'object') {
    if (item.id !== undefined && item.id !== null) {
      return `id:${item.tab ?? ''}:${String(item.id)}`;
    }
    return `name:${item.tab ?? ''}:${String(item.name ?? '')}`;
  }
  return `str:${String(item)}`;
}

function chipName(item) {
  return item && typeof item === 'object' ? String(item.name ?? '') : String(item);
}

function sameChip(a, b) {
  return chipIdKey(a) === chipIdKey(b) && chipName(a) === chipName(b);
}

function mergeChipField(prev, next) {
  const added = clone(prev.added || []);
  const removed = clone(prev.removed || []);

  // Process next.added: cancel against prev.removed when identical; if same id
  // with a different name, keep both so the renderer pairs them as old -> new.
  for (const item of next.added || []) {
    const exactIdx = removed.findIndex((r) => sameChip(r, item));
    if (exactIdx >= 0) {
      removed.splice(exactIdx, 1);
      continue;
    }
    if (!added.some((a) => sameChip(a, item))) {
      added.push(clone(item));
    }
  }

  // Process next.removed: cancel against acc.added (by id or exact match, since
  // an item added in an earlier step and removed here never existed before the
  // range and doesn't exist after it).
  for (const item of next.removed || []) {
    const idMatch = added.findIndex((a) => chipIdKey(a) === chipIdKey(item));
    if (idMatch >= 0) {
      added.splice(idMatch, 1);
      continue;
    }
    if (!removed.some((r) => sameChip(r, item))) {
      removed.push(clone(item));
    }
  }

  const merged = {
    ...prev,
    ...next,
    before: prev.before,
    after: next.after,
    added,
    removed,
  };
  if (added.length === 0 && removed.length === 0 && sameScalar(merged.before, merged.after)) {
    return null;
  }
  return merged;
}

function mergeField(prev, next) {
  if (prev.unchanged && next.unchanged) return clone(next);
  if (prev.unchanged) return clone(next);
  if (next.unchanged) return clone(prev);

  if (hasMembers(prev) || hasMembers(next)) {
    return mergeChipField(prev, next);
  }

  const isLong = Boolean(prev.long || next.long);
  const before = prev.before;
  const after = next.after;
  if (sameScalar(before, after, isLong)) return null;

  const merged = {
    ...prev,
    ...next,
    before,
    after,
  };
  if (isLong) merged.long = true;
  delete merged.unchanged;
  return merged;
}

function mergeChangedEntries(prev, next) {
  const fieldsByKey = new Map();
  const fieldOrder = [];

  for (const f of prev.fields || []) {
    const k = fieldKey(f);
    fieldsByKey.set(k, clone(f));
    fieldOrder.push(k);
  }

  for (const f of next.fields || []) {
    const k = fieldKey(f);
    if (!fieldsByKey.has(k)) {
      fieldsByKey.set(k, clone(f));
      fieldOrder.push(k);
    } else {
      const merged = mergeField(fieldsByKey.get(k), f);
      if (merged === null) {
        fieldsByKey.delete(k);
      } else {
        fieldsByKey.set(k, merged);
      }
    }
  }

  const fields = [];
  for (const k of fieldOrder) {
    const f = fieldsByKey.get(k);
    if (f) fields.push(f);
  }

  const hasRealChange = fields.some((f) => !f.unchanged);
  if (!hasRealChange) return null;

  // Keep latest display metadata (name, image, badges, group, meta) from next.
  return {
    ...prev,
    ...next,
    fields,
  };
}

function applyChangeToAddedEntry(addedEntry, changeEntry) {
  const updated = {
    ...addedEntry,
    name: changeEntry.name ?? addedEntry.name,
  };
  if (changeEntry.image !== undefined) updated.image = changeEntry.image;
  if (changeEntry.badges !== undefined) updated.badges = clone(changeEntry.badges);
  if (changeEntry.group !== undefined) updated.group = changeEntry.group;
  if (changeEntry.meta !== undefined) updated.meta = clone(changeEntry.meta);

  // If the follow-up patch updated the description, reflect the final text.
  const descField = (changeEntry.fields || []).find(
    (f) => f.field === 'description' && !f.unchanged && f.after !== undefined,
  );
  if (descField && 'description' in addedEntry) {
    updated.description = descField.after;
  }
  return updated;
}

function sameEntrySummary(a, b) {
  return normWs(a?.name) === normWs(b?.name)
    && normWs(a?.description) === normWs(b?.description)
    && (a?.group ?? '') === (b?.group ?? '')
    && JSON.stringify(a?.meta ?? null) === JSON.stringify(b?.meta ?? null);
}

/**
 * Derive the ordered list of builds (newest -> oldest) from patch_notes_index.json's
 * `diffs` array (also newest -> oldest). Each entry describes a selectable build endpoint.
 */
export function extractBuilds(diffs) {
  if (!Array.isArray(diffs) || diffs.length === 0) return [];
  const builds = [];

  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    const [rawTitle, ...rest] = String(d.label || d.id).split(' · ');
    const title = d.after_version ? `v${d.after_version}` : rawTitle;
    builds.push({
      build: d.after,
      version: d.after_version || null,
      title,
      label: d.label || d.id,
      date: d.date || '',
      dateShort: rest.join(' · '),
      phase: d.phase || '',
      crossing: Boolean(d.phase_change),
      diffIndex: i,
    });
  }

  // Append the earliest `before` build (base of the oldest diff).
  const oldest = diffs[diffs.length - 1];
  const baseVersion = oldest.before_version || null;
  builds.push({
    build: oldest.before,
    version: baseVersion,
    title: baseVersion ? `v${baseVersion}` : `Build ${oldest.before}`,
    label: baseVersion ? `v${baseVersion} · Build ${oldest.before}` : `Build ${oldest.before}`,
    date: '',
    dateShort: `Build ${oldest.before}`,
    phase: oldest.phase || '',
    crossing: false,
    diffIndex: diffs.length,
  });

  return builds;
}

/**
 * Given newest-first `diffs` and two build hashes (`fromBuild` older than `toBuild`),
 * return the chronological array (oldest -> newest) of diff descriptors spanning
 * from `fromBuild` to `toBuild`, or null if no valid forward chain exists.
 */
export function findDiffRange(diffs, fromBuild, toBuild) {
  if (!Array.isArray(diffs) || !fromBuild || !toBuild || fromBuild === toBuild) return null;

  const toIdx = diffs.findIndex((d) => d.after === toBuild);
  if (toIdx < 0) return null;

  const chain = [];
  let cursor = toBuild;
  for (let i = toIdx; i < diffs.length; i++) {
    const d = diffs[i];
    if (d.after !== cursor) continue;
    chain.push(d);
    cursor = d.before;
    if (cursor === fromBuild) {
      return chain.reverse();
    }
  }
  return null;
}

/**
 * Compose an ordered chronological list of patch-notes objects (oldest -> newest)
 * into a single net patch-notes object.
 */
export function composePatchNotes(notesList) {
  if (!Array.isArray(notesList) || notesList.length === 0) return null;
  if (notesList.length === 1) return notesList[0];

  const first = notesList[0];
  const last = notesList[notesList.length - 1];

  const sectionOrder = [];
  const sectionMeta = new Map();
  const sectionStates = new Map();

  for (const notes of notesList) {
    for (const section of notes.sections || []) {
      const key = section.key;
      if (!sectionMeta.has(key)) {
        sectionOrder.push(key);
        sectionMeta.set(key, {
          key,
          label: section.label,
          tab: section.tab ?? null,
          note: section.note ?? null,
          groups: Array.isArray(section.groups) ? [...section.groups] : null,
          truncated: { added: false, removed: false, changed: false },
        });
        sectionStates.set(key, new Map());
      } else {
        const meta = sectionMeta.get(key);
        if (section.note && !meta.note) meta.note = section.note;
        if (Array.isArray(section.groups)) {
          if (!meta.groups) meta.groups = [];
          for (const g of section.groups) {
            if (!meta.groups.includes(g)) meta.groups.push(g);
          }
        }
      }

      const meta = sectionMeta.get(key);
      for (const b of BUCKETS) {
        if (section.truncated?.[b]) meta.truncated[b] = true;
      }

      const entries = sectionStates.get(key);

      // 1. Removed
      for (const e of section.removed || []) {
        const id = String(e.id);
        const prev = entries.get(id);
        if (!prev) {
          entries.set(id, { kind: 'removed', entry: clone(e) });
        } else if (prev.kind === 'added') {
          // Added in an earlier patch in this range, then removed: net zero.
          entries.delete(id);
        } else if (prev.kind === 'changed') {
          // Changed earlier, then removed: net effect is removed.
          // Restore original name if it had been renamed in an earlier step.
          const removedEntry = clone(e);
          const nameField = (prev.entry.fields || []).find((f) => f.field === 'name' && f.before);
          if (nameField) removedEntry.name = nameField.before;
          entries.set(id, { kind: 'removed', entry: removedEntry });
        }
      }

      // 2. Added
      for (const e of section.added || []) {
        const id = String(e.id);
        const prev = entries.get(id);
        if (!prev) {
          entries.set(id, { kind: 'added', entry: clone(e) });
        } else if (prev.kind === 'removed') {
          // Removed earlier in the range, then re-added.
          if (key === 'client_text' || sameEntrySummary(prev.entry, e)) {
            entries.delete(id);
          } else {
            // Re-added with visibly different summary: show as changed on known fields.
            const fields = [];
            if (normWs(prev.entry.name) !== normWs(e.name)) {
              fields.push({ field: 'name', label: 'Name', before: prev.entry.name, after: e.name });
            }
            if (normWs(prev.entry.description) !== normWs(e.description)) {
              fields.push({
                field: 'description', label: 'Description',
                before: prev.entry.description ?? null, after: e.description ?? null, long: true,
              });
            }
            if (fields.length) {
              entries.set(id, { kind: 'changed', entry: { ...clone(e), fields } });
            } else {
              entries.set(id, { kind: 'added', entry: clone(e) });
            }
          }
        } else {
          entries.set(id, { kind: 'added', entry: clone(e) });
        }
      }

      // 3. Changed
      for (const e of section.changed || []) {
        const id = String(e.id);
        const prev = entries.get(id);
        if (!prev) {
          entries.set(id, { kind: 'changed', entry: clone(e) });
        } else if (prev.kind === 'added') {
          entries.set(id, { kind: 'added', entry: applyChangeToAddedEntry(prev.entry, e) });
        } else if (prev.kind === 'changed') {
          const merged = mergeChangedEntries(prev.entry, e);
          if (merged === null) {
            entries.delete(id);
          } else {
            entries.set(id, { kind: 'changed', entry: merged });
          }
        } else {
          entries.set(id, { kind: 'changed', entry: clone(e) });
        }
      }
    }
  }

  const sections = [];
  const totals = { added: 0, removed: 0, changed: 0 };

  for (const key of sectionOrder) {
    const meta = sectionMeta.get(key);
    const entries = sectionStates.get(key);
    const added = [];
    const removed = [];
    const changed = [];

    for (const state of entries.values()) {
      if (state.kind === 'added') added.push(state.entry);
      else if (state.kind === 'removed') removed.push(state.entry);
      else if (state.kind === 'changed') changed.push(state.entry);
    }

    if (!added.length && !removed.length && !changed.length) continue;

    const counts = {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
    };
    totals.added += counts.added;
    totals.removed += counts.removed;
    totals.changed += counts.changed;

    const sectionOut = {
      key: meta.key,
      label: meta.label,
      tab: meta.tab,
      counts,
      truncated: meta.truncated,
      note: meta.note,
      added,
      removed,
      changed,
    };
    if (meta.groups) sectionOut.groups = meta.groups;
    sections.push(sectionOut);
  }

  return {
    schema_version: last.schema_version ?? 1,
    generated_at: last.generated_at ?? first.generated_at ?? null,
    generator: 'patch-diff-compose.js',
    composed: true,
    step_count: notesList.length,
    max_items: last.max_items ?? 0,
    before: clone(first.before),
    after: clone(last.after),
    totals,
    sections,
  };
}
