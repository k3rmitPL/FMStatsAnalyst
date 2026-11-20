// The two compare players of the Table tab, A and B, by row id. The table colours values against
// the first one selected; the chart side panel compares both. Each dataset remembers its own pair
// in this browser (row ids belong to a dataset), restored once the dataset's rows are loaded.

import { computed, ref, watch } from 'vue'

import { ROW_ID } from '@/services/db'
import { readPreference, writePreference } from '@/utils/preferences'

const PREFERENCE = 'comparePlayers' // { [datasetId]: [rowIdA, rowIdB] } (older versions: rowId)
const isRecord = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/** The remembered pair of a dataset; an older single player becomes A. */
function readPair(datasetId) {
  const saved = readPreference(PREFERENCE, {}, isRecord)[datasetId]
  if (Array.isArray(saved)) return [saved[0] ?? null, saved[1] ?? null]
  return [saved ?? null, null]
}

/**
 * @param selectedId  ref: the selected dataset's id
 * @param rows        ref: the dataset's loaded rows (empty while loading)
 * @param imports     ref: the saved datasets, to forget pairs of deleted ones
 */
export function useComparePlayers({ selectedId, rows, imports }) {
  // [A, B]: row ids or null.
  const ids = ref([null, null])

  function remember() {
    const datasetId = selectedId.value
    if (datasetId == null) return
    const known = new Set(imports.value.map((i) => String(i.id)))
    const saved = Object.fromEntries(
      Object.entries(readPreference(PREFERENCE, {}, isRecord)).filter(([id]) => known.has(id)),
    )
    if (ids.value.every((id) => id == null)) delete saved[datasetId]
    else saved[datasetId] = [...ids.value]
    writePreference(PREFERENCE, saved)
  }

  // Restored once the rows are loaded (also when the tab opens with them loaded), none meanwhile.
  watch(
    rows,
    (loaded) => {
      const exists = (id) => id != null && loaded.some((r) => r[ROW_ID] === id)
      ids.value = loaded.length
        ? readPair(selectedId.value).map((id) => (exists(id) ? id : null))
        : [null, null]
    },
    { immediate: true },
  )

  /** Sets slot 0 (A) or 1 (B); the other slot is cleared when it holds the same player. */
  function setSlot(slot, id) {
    const next = [...ids.value]
    next[slot] = id ?? null
    if (id != null && next[1 - slot] === id) next[1 - slot] = null
    ids.value = next
    remember()
  }

  /** The slot a player is in (0, 1 or -1). */
  function slotOf(id) {
    return id == null ? -1 : ids.value.indexOf(id)
  }

  /**
   * The row button: removes a selected player; otherwise fills the first empty slot, or replaces
   * the last one when both are taken.
   */
  function toggle(id) {
    const slot = slotOf(id)
    if (slot !== -1) setSlot(slot, null)
    else setSlot(ids.value[0] == null ? 0 : 1, id)
  }

  // The selected ids in slot order, without empty slots.
  const selected = computed(() => ids.value.filter((id) => id != null))

  return { ids, setSlot, slotOf, toggle, selected }
}
