// The dataset open on the Analyse page, shared by its Table and Charts tabs: the saved datasets,
// the selected one's rows and stats with the custom metrics computed in, its shortlist and notes,
// and the player list for player lookups. What each tab shows of it (columns, filters, charts) is
// the tab's own.

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  deleteImport,
  getImports,
  getRows,
  getStats,
  ROW_ID,
  updateImport,
  updateRowValue,
} from '@/services/db'
import { computeMetrics } from '@/services/metrics'
import { NOTES_COLUMN } from '@/services/transform'
import { useLibraryStore } from '@/stores/library'
import { formatCell, isEmpty } from '@/utils/format'
import { readPreference, writePreference } from '@/utils/preferences'

// Columns described in player lookups, when the dataset has them.
export const PLAYER_COLUMN = 'Player'
export const TEAM_COLUMN = 'Club'
const LEAGUE_COLUMN = 'Division'
const POSITION_COLUMN = 'Position'
const AGE_COLUMN = 'Age'

export const useAnalysisStore = defineStore('analysis', () => {
  const library = useLibraryStore()
  library.load()

  const imports = ref([])
  const selectedId = ref(null)
  const rows = ref([])
  const stats = ref({})
  const isLoading = ref(false)

  const selectedImport = computed(() => imports.value.find((i) => i.id === selectedId.value))
  const datasetColumns = computed(() => selectedImport.value?.columns ?? [])

  // Custom metrics are computed in memory and added as extra columns, before the dataset's own.
  const metricResult = computed(() =>
    rows.value.length && library.metrics.length
      ? computeMetrics(rows.value, library.metrics, datasetColumns.value)
      : null,
  )
  // Rows with metric values added (copies of `rows` when there are metrics).
  const tableRows = computed(() => metricResult.value?.rows ?? rows.value)
  const columns = computed(() => [...(metricResult.value?.columns ?? []), ...datasetColumns.value])
  const columnInfo = computed(() => ({
    ...selectedImport.value?.columnInfo,
    ...metricResult.value?.columnInfo,
  }))
  const allStats = computed(() => ({ ...stats.value, ...metricResult.value?.stats }))

  /**
   * Reloads the list of saved datasets and picks one: `preferredId` when given and saved, else the
   * one last used in this browser, else the one already selected, else the newest.
   */
  async function loadImports(preferredId = null) {
    imports.value = await getImports()
    const exists = (id) => id != null && imports.value.some((i) => i.id === id)
    const remembered = readPreference('dataset', null)
    if (exists(preferredId)) selectedId.value = preferredId
    else if (exists(remembered)) selectedId.value = remembered
    else if (!exists(selectedId.value)) selectedId.value = imports.value[0]?.id ?? null
  }

  /** Deletes the selected dataset and selects another one. */
  async function deleteSelected() {
    const current = selectedImport.value
    if (!current) return
    await deleteImport(current.id)
    selectedId.value = null
    await loadImports()
  }

  watch(selectedId, async (id) => {
    rows.value = []
    stats.value = {}
    if (id == null) return
    writePreference('dataset', id)
    isLoading.value = true
    try {
      const [loadedRows, loadedStats] = await Promise.all([getRows(id), getStats(id)])
      // Another dataset may have been chosen while this one was loading.
      if (selectedId.value !== id) return
      rows.value = loadedRows
      stats.value = loadedStats
    } finally {
      if (selectedId.value === id) isLoading.value = false
    }
  })

  // Shortlisted players of the selected dataset, by row id. Each dataset keeps its own shortlist
  // on its import record, apart from the row data (a dataset imported twice has two shortlists).
  const shortlistIds = computed(() => new Set(selectedImport.value?.shortlist ?? []))

  function isShortlisted(row) {
    return shortlistIds.value.has(row?.[ROW_ID])
  }

  /** Adds a player to the shortlist or removes them. Throws when saving fails. */
  async function toggleShortlist(row) {
    const current = selectedImport.value
    const id = row[ROW_ID]
    if (!current || id == null) return
    const next = new Set(shortlistIds.value)
    if (!next.delete(id)) next.add(id)
    const ids = [...next]
    current.shortlist = ids
    // The plain array: IndexedDB can't store the reactive copy in `current`.
    await updateImport(current.id, { shortlist: ids })
  }

  /** Saves a player's notes, in memory and in the database. Throws when saving fails. */
  async function saveNotes(rowId, text) {
    // Shown rows can be copies (with metric values added); the loaded row is the one to change.
    const source = rows.value.find((r) => r[ROW_ID] === rowId)
    if (rowId == null || !source) return
    await updateRowValue(rowId, NOTES_COLUMN, text)
    source[NOTES_COLUMN] = text
  }

  // Players picked on a chart to show in the table: { ids: Set of row ids, label } or null. While
  // set, the table lists only them (its own positions and conditions are set aside). Cleared when
  // another dataset is chosen.
  const chartSelection = ref(null)
  watch(selectedId, () => (chartSelection.value = null))

  // Players for player lookups, alphabetically; empty when the dataset has no player names.
  // Club, league, positions and age are added only when the dataset has those columns and values.
  const players = computed(() => {
    const available = new Set(datasetColumns.value)
    if (!available.has(PLAYER_COLUMN)) return []
    const text = (row, col) => {
      if (!available.has(col) || isEmpty(row[col])) return ''
      return formatCell(row[col]).trim()
    }
    const list = []
    for (const row of rows.value) {
      const name = text(row, PLAYER_COLUMN)
      if (!name || row[ROW_ID] == null) continue
      const age = text(row, AGE_COLUMN)
      const details = [
        text(row, TEAM_COLUMN),
        text(row, LEAGUE_COLUMN),
        text(row, POSITION_COLUMN),
        age && `Age ${age}`,
      ].filter(Boolean)
      list.push({ id: row[ROW_ID], name, details })
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  })

  return {
    imports,
    selectedId,
    selectedImport,
    datasetColumns,
    rows,
    stats,
    isLoading,
    tableRows,
    columns,
    columnInfo,
    allStats,
    loadImports,
    deleteSelected,
    shortlistIds,
    isShortlisted,
    toggleShortlist,
    saveNotes,
    chartSelection,
    players,
  }
})
