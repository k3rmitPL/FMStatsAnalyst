<script setup>
// Table tab of the Analyse page: the selected dataset as a table, shown through a saved view.
import { storeToRefs } from 'pinia'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onActivated,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ActionMenu from '@/components/ActionMenu.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import DatasetControls from '@/components/DatasetControls.vue'
import NotesDialog from '@/components/NotesDialog.vue'
import PlayerSelect from '@/components/PlayerSelect.vue'
import SaveViewDialog from '@/components/SaveViewDialog.vue'
import TeamSelect from '@/components/TeamSelect.vue'
import ViewFiltersDialog from '@/components/ViewFiltersDialog.vue'
import { useComparePlayers } from '@/composables/useComparePlayers'
import { ROW_ID } from '@/services/db'
import { defaultChartSettings, normalizeChartSettings } from '@/services/charts/panelSettings'
import { positionsPool } from '@/services/charts/stats'
import { downloadJson, jsonFileName, pickFile } from '@/services/fileTransfer'
import { NA, NOTES_COLUMN } from '@/services/transform'
import { newView, normalizeFilter, viewRowFilter, viewsFile } from '@/services/views'
import { PLAYER_COLUMN, TEAM_COLUMN, useAnalysisStore } from '@/stores/analysis'
import { useLibraryStore } from '@/stores/library'
import { columnLabel, isLowerBetter, isRankedColumn } from '@/utils/columns'
import { formatCell, isEmpty } from '@/utils/format'
import { readPreference, usePreference, writePreference } from '@/utils/preferences'
import { foldText } from '@/utils/text'

const PAGE_SIZES = [15, 20, 30, 50, 100]

// Columns frozen to the table edges by default (raw CSV / derived column names).
const DEFAULT_FROZEN_LEFT = ['Player', 'Club']
const DEFAULT_FROZEN_RIGHT = [NOTES_COLUMN]

// Width of the Notes column in px; longer notes are cut off (the full text is in a tooltip).
const NOTES_COLUMN_WIDTH = 100

// Colours against the compared player: green = better, red = worse (the full colours are
// $compare-better-color and $compare-worse-color in _variables.scss). The share of the colour
// mixed into the cell's background grows from MIN % (a value just past the compared player's)
// to MAX % (the dataset's best or worst value).
const COMPARE_MIN_STRENGTH = 6
const COMPARE_MAX_STRENGTH = 100
// While comparing, metrics with their own red → green scale use the comparison colours too.
// Set to false to keep their scale and colour only the other columns against the player.
const COMPARE_OVERRIDES_COLOR_SCALE = true

const HEADER_ANGLE = (90 * Math.PI) / 180

const COLUMN_DRAG_TYPE = 'application/x-fm-column'

const STAR_PATH = 'M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.4l-4.2 2.4 1-4.6L1.3 6l4.7-.5z'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
library.load()

// The dataset, shared with the Charts tab.
const analysis = useAnalysisStore()
const {
  imports,
  selectedId,
  rows,
  isLoading,
  tableRows,
  columns,
  columnInfo,
  allStats,
  players: comparePlayers,
  chartSelection,
} = storeToRefs(analysis)
const { isShortlisted } = analysis

const search = ref('')
const sortKey = ref(null)
const sortDir = ref(1)
const page = ref(1)
// Remembered in this browser.
const pageSize = usePreference('pageSize', PAGE_SIZES[0], (v) => PAGE_SIZES.includes(v))
// The table shows a working copy of the selected view (or of the default layout when none is
// selected). Columns and sorting are set up in the table itself, positions and conditions in the
// Filters dialog. Save writes the copy back to the view, Revert reloads it.
// Visible columns in order; null = every column of the dataset.
const shownColumns = ref(null)
const frozenLeft = ref([...DEFAULT_FROZEN_LEFT])
const frozenRight = ref([...DEFAULT_FROZEN_RIGHT])
const positions = ref([])
// Chart panel settings (type, metrics, typical value), part of the view like its filters.
const DEFAULT_CHART = defaultChartSettings()
const chartSettings = ref(DEFAULT_CHART)
const filters = ref([])
const filtersOpen = ref(false)
// Short status message after importing views, hidden again after a few seconds.
const message = ref('')
let messageTimer = null
watch(message, (text) => {
  clearTimeout(messageTimer)
  if (text) messageTimer = setTimeout(() => (message.value = ''), 6000)
})
// Header drag and drop: the dragged column and where it would land.
const draggedColumn = ref(null)
const dropMark = ref(null) // { col, after }
// Sticky offsets in px per frozen column, measured from the rendered header cells.
const stickyOffsets = ref({})
const headerCells = new Map()
// Rotated headers: labels turned 70° counter-clockwise to keep columns narrow.
const rotateHeaders = usePreference('rotateHeaders', false, (v) => typeof v === 'boolean')
const headerHeight = ref(0)
// Length of every rotated label band, so each one reaches from the bottom to the top edge.
const labelLength = ref(0)
// Space after the last column so its rotated label is not cut off.
const headerOverhang = ref(0)
// Saved view applied to the table ('' = all columns, no filters): the one in the URL, else the
// one last used here.
const activeViewId = ref(
  typeof route.query.view === 'string'
    ? route.query.view
    : readPreference('analyseView', '', (v) => typeof v === 'string'),
)
// Row whose notes are being edited in the Notes dialog.
const notesRow = ref(null)
const notesOpen = ref(false)
// Team whose players are highlighted in the table ('' = none). Remembered in this browser.
const selectedTeam = usePreference('team', '', (v) => typeof v === 'string')
// Only list shortlisted players. Remembered in this browser.
const shortlistOnly = usePreference('shortlistOnly', false, (v) => typeof v === 'boolean')
// Header of the shortlist column, always the first one; frozen columns start after it.
const shortlistHeader = ref(null)
// Compare players A and B, by row id. The table colours values against the first one selected.
const compare = useComparePlayers({ selectedId, rows, imports })
const comparePlayerId = computed(() => compare.selected.value[0] ?? null)
const COMPARE_SLOTS = ['A', 'B']

function compareSlotClass(row) {
  const slot = compare.slotOf(row[ROW_ID])
  return slot === -1 ? null : `slot-${COMPARE_SLOTS[slot].toLowerCase()}`
}

function compareTitle(row) {
  const slot = compare.slotOf(row[ROW_ID])
  if (slot !== -1) return `Compared as ${COMPARE_SLOTS[slot]}; click to remove`
  const [a, b] = compare.ids.value
  if (a == null) return 'Compare as A'
  if (b == null) return 'Compare as B'
  return 'Compare as B (replaces the current B)'
}

// Chart panel next to the table. Remembered in this browser.
const chartPanelOpen = usePreference('chartPanelOpen', false, (v) => typeof v === 'boolean')
// Loaded when first shown: it brings in ECharts.
const ChartSidePanel = defineAsyncComponent(() => import('@/components/charts/ChartSidePanel.vue'))
// Compare players for the chart, in slot order: { name, row }.
const chartPlayers = computed(() =>
  compare.selected.value
    .map((id) => tableRows.value.find((r) => r[ROW_ID] === id))
    .filter(Boolean)
    .map((row) => ({ name: String(row[PLAYER_COLUMN] ?? 'Player'), row })),
)
// The whole dataset with only the view's positions, for the chart's reference group.
const chartPositionsRows = computed(() =>
  positionsPool(tableRows.value, activePositions.value, columnInfo.value),
)
// Floating comparison row: the compared player's values, shown next to the hovered row.
const tableWrap = ref(null)
const mainTable = ref(null)
const tableBody = ref(null)
const floatEl = ref(null)
// Index of the hovered row in `pageRows` (null = none).
const hoveredIndex = ref(null)
// Position of the floating row in the table wrapper's content, px (null = not placed yet).
const floatTop = ref(null)
// Measured widths of the header cells, which the floating row copies.
const columnWidths = ref({ shortlist: 0, columns: {}, table: 0 })

async function toggleShortlist(row) {
  try {
    await analysis.toggleShortlist(row)
  } catch (error) {
    message.value = `Saving the shortlist failed: ${error.message}`
  }
}

// Every team in the dataset, alphabetically.
const teams = computed(() => {
  const names = new Set()
  for (const row of rows.value) {
    const name = row[TEAM_COLUMN]
    if (typeof name === 'string' && name.trim() && name !== NA) names.add(name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
})

function isTeamRow(row) {
  return selectedTeam.value !== '' && row[TEAM_COLUMN] === selectedTeam.value
}

const activeView = computed(() => library.views.find((v) => v.id === activeViewId.value) ?? null)
/** The layout and filters a view describes (or the default ones), as plain working state. */
function viewSource(view) {
  if (!view) {
    return {
      shown: null,
      frozenLeft: [...DEFAULT_FROZEN_LEFT],
      frozenRight: [...DEFAULT_FROZEN_RIGHT],
      positions: [],
      filters: [],
      sort: null,
      chart: DEFAULT_CHART,
    }
  }
  const copy = JSON.parse(JSON.stringify(view))
  return {
    shown: copy.columns ?? [],
    frozenLeft: copy.frozenLeft ?? [],
    frozenRight: copy.frozenRight ?? [],
    positions: copy.positions ?? [],
    filters: copy.filters ?? [],
    sort: copy.sort?.column ? { column: copy.sort.column, direction: copy.sort.direction } : null,
    chart: normalizeChartSettings(copy.chart, DEFAULT_CHART),
  }
}

/**
 * What the table shows for some working state, limited to the dataset's columns:
 * columns in display order (frozen left, scrolling middle, frozen right) plus the filters.
 * Comparing this for the working state and the saved view tells whether there are changes.
 */
function resolveLayout(source) {
  const available = new Set(columns.value)
  const shown = source.shown ? new Set(source.shown) : null
  const isShown = (c) => available.has(c) && (!shown || shown.has(c))
  const left = [...new Set(source.frozenLeft.filter(isShown))]
  const right = [...new Set(source.frozenRight.filter((c) => isShown(c) && !left.includes(c)))]
  const frozen = new Set([...left, ...right])
  const middle = [...new Set(source.shown ?? columns.value)].filter(
    (c) => isShown(c) && !frozen.has(c),
  )
  return {
    columns: [...left, ...middle, ...right],
    frozenLeft: left,
    frozenRight: right,
    positions: source.positions,
    filters: source.filters.map(normalizeFilter),
    sort: source.sort,
    chart: normalizeChartSettings(source.chart, DEFAULT_CHART),
  }
}

const sort = computed({
  get: () =>
    sortKey.value
      ? { column: sortKey.value, direction: sortDir.value === 1 ? 'asc' : 'desc' }
      : null,
  set: (value) => {
    sortKey.value = value?.column || null
    sortDir.value = value?.direction === 'asc' ? 1 : -1
    page.value = 1
  },
})

const workingSource = computed(() => ({
  shown: shownColumns.value,
  frozenLeft: frozenLeft.value,
  frozenRight: frozenRight.value,
  positions: positions.value,
  filters: filters.value,
  sort: sort.value,
  chart: chartSettings.value,
}))
const layout = computed(() => resolveLayout(workingSource.value))
const savedLayout = computed(() => resolveLayout(viewSource(activeView.value)))
const isDirty = computed(() => JSON.stringify(layout.value) !== JSON.stringify(savedLayout.value))

const visibleLeft = computed(() => layout.value.frozenLeft)
const visibleRight = computed(() => layout.value.frozenRight)
const displayColumns = computed(() => layout.value.columns)

// Columns hidden in the table, for the column picker.
const hiddenColumns = computed({
  get: () => new Set(columns.value.filter((c) => !displayColumns.value.includes(c))),
  set: (hidden) => {
    const current = shownColumns.value ?? columns.value
    const kept = current.filter((c) => !hidden.has(c))
    const added = columns.value.filter((c) => !hidden.has(c) && !kept.includes(c))
    shownColumns.value = [...kept, ...added]
  },
})

// Positions this dataset has a column for. A view's other positions are kept (they apply to
// datasets that have them) but don't filter here, so they can't hide every player.
const activePositions = computed(() =>
  positions.value.filter((pos) => columnInfo.value[pos]?.type === 'boolean'),
)
const filterCount = computed(
  () => activePositions.value.length + filters.value.filter((f) => f.enabled !== false).length,
)
const rowFilter = computed(() =>
  filterCount.value
    ? viewRowFilter({ positions: activePositions.value, filters: filters.value })
    : null,
)

// Rows matching the view's positions and conditions, then also the search box. Players picked on
// a chart ("Show in table") replace the positions and conditions until the chip is cleared.
const viewRows = computed(() => {
  const picked = chartSelection.value?.ids
  if (picked) return tableRows.value.filter((r) => picked.has(r[ROW_ID]))
  return rowFilter.value ? tableRows.value.filter(rowFilter.value) : tableRows.value
})
watch(chartSelection, () => (page.value = 1))
// Then only shortlisted players, when chosen (kept out of viewRows, which the Filters dialog counts).
const listedRows = computed(() =>
  shortlistOnly.value ? viewRows.value.filter(isShortlisted) : viewRows.value,
)
// Every row's values as shown, prepared for the search box (ignoring case and accents). Values are
// kept apart by a character nobody types, so a search can't match across two columns. Built only
// once something is searched for, then reused while typing.
const searchTexts = computed(() => {
  if (!search.value.trim()) return null
  const texts = new Map()
  for (const row of tableRows.value) {
    texts.set(row, foldText(columns.value.map((col) => formatCell(row[col])).join('\u0000')))
  }
  return texts
})
const filteredRows = computed(() => {
  const term = foldText(search.value.trim())
  if (!term) return listedRows.value
  return listedRows.value.filter((row) => searchTexts.value.get(row)?.includes(term))
})

const sortedRows = computed(() => {
  if (!sortKey.value) return filteredRows.value
  const key = sortKey.value
  const dir = sortDir.value
  return [...filteredRows.value].sort((a, b) => compareValues(a[key], b[key], dir))
})

/** Changes the page size, staying on the page that contains the current first row. */
function changePageSize(size) {
  const firstRow = (page.value - 1) * pageSize.value
  pageSize.value = size
  page.value = Math.floor(firstRow / size) + 1
}

const pageCount = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value)))
const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sortedRows.value.slice(start, start + pageSize.value)
})

// Row of the compared player, with metric values (null when none is chosen).
const compareRow = computed(() =>
  comparePlayerId.value == null
    ? null
    : (tableRows.value.find((r) => r[ROW_ID] === comparePlayerId.value) ?? null),
)
// The floating row shows while another player's row is hovered.
const showFloat = computed(() => {
  const hovered = hoveredIndex.value == null ? null : pageRows.value[hoveredIndex.value]
  return Boolean(compareRow.value && hovered && hovered[ROW_ID] !== comparePlayerId.value)
})

/** Fixed width for a column of the floating row, copied from the table's header. */
function floatColumnStyle(width) {
  const px = `${width ?? 0}px`
  return { width: px, minWidth: px, maxWidth: px }
}

// Empty values (null, '', N/A) always sort last, whichever the direction.
function compareValues(a, b, dir) {
  const aEmpty = isEmpty(a)
  const bEmpty = isEmpty(b)
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
  // true before false when ascending, so the first click lists players who can play a position.
  if (typeof a === 'boolean' && typeof b === 'boolean') return (b - a) * dir
  if (a instanceof Date && b instanceof Date) return (a - b) * dir
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return String(a).localeCompare(String(b), undefined, { numeric: true }) * dir
}

// Descriptions of custom metrics, by column name.
const metricDescriptions = computed(
  () => new Map(library.metrics.map((m) => [m.name, m.description?.trim() ?? ''])),
)

/** Tooltip: column name, a metric's description, and the range of values. */
function headerTitle(col) {
  const lines = [col]
  const description = columnInfo.value[col]?.metric && metricDescriptions.value.get(col)
  if (description) lines.push(description)
  const range = allStats.value[col]
  if (range) lines.push(`Range: ${formatCell(range.min)} – ${formatCell(range.max)}`)
  return lines.join('\n')
}

function isNotesColumn(col) {
  return columnInfo.value[col]?.type === 'notes'
}

/** Fixed width for the Notes column, on its header and cells. */
function widthStyle(col) {
  if (!isNotesColumn(col)) return undefined
  const width = `${NOTES_COLUMN_WIDTH}px`
  return { width, minWidth: width, maxWidth: width }
}

function editNotes(row) {
  notesRow.value = row
  notesOpen.value = true
}

/** Saves the edited notes to the row in memory and in the database. */
async function saveNotes(text) {
  try {
    await analysis.saveNotes(notesRow.value?.[ROW_ID], text)
  } catch (error) {
    message.value = `Saving the notes failed: ${error.message}`
  }
}

/**
 * Cell colours. While a player is compared, numbers are coloured against theirs (see
 * `compareStyle`); otherwise metrics with a colour scale go from red (worst) to green (best).
 */
function cellStyle(col, value) {
  const style = { ...stickyStyle(col), ...widthStyle(col) }
  const info = columnInfo.value[col]
  if (typeof value !== 'number') return style
  const comparing = compareRow.value && isRankedColumn(col, info)
  if (comparing && (COMPARE_OVERRIDES_COLOR_SCALE || !info.colorScale)) {
    return { ...style, ...compareStyle(col, value) }
  }
  if (!info?.colorScale) return style
  const range = allStats.value[col]
  const span = range ? range.max - range.min : 0
  let progress = span > 0 ? Math.round(((value - range.min) / span) * 100) : 100
  if (isLowerBetter(col, info)) progress = 100 - progress
  // return {
  //   ...style,
  //   backgroundColor: `color-mix(in lab, #ff9797, #82ff7d ${progress}%)`,
  //   color: '#000',
  // }
  return {
    ...style,
    backgroundColor: `color-mix(in lab, var(--compare-worse), var(--compare-better) ${progress}%)`,
    // color: '#000',
  }
}

/**
 * Colours a value against the compared player's: green when better, red when worse. The colour
 * is strongest at the dataset's best (or worst) value and fades to the cell's own background
 * (`--cell-background`, which follows hovered and team rows) at the compared player's value.
 */
function compareStyle(col, value) {
  const base = compareRow.value[col]
  const range = allStats.value[col]
  if (typeof base !== 'number' || !range || value === base) return {}
  const higher = value > base
  const better = higher !== isLowerBetter(col, columnInfo.value[col])
  // Distance from the compared value towards the dataset's end on this side, 0 to 1.
  const end = higher ? range.max : range.min
  const share = end === base ? 1 : Math.min(1, Math.abs((value - base) / (end - base)))
  const strength = COMPARE_MIN_STRENGTH + share * (COMPARE_MAX_STRENGTH - COMPARE_MIN_STRENGTH)
  const color = better ? 'var(--compare-better)' : 'var(--compare-worse)'
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${strength.toFixed(1)}%, var(--cell-background))`,
  }
}

/** Loads the selected view (or the default layout) into the table, dropping unsaved changes. */
function applyView() {
  const source = viewSource(activeView.value)
  shownColumns.value = source.shown
  frozenLeft.value = source.frozenLeft
  frozenRight.value = source.frozenRight
  positions.value = source.positions
  filters.value = source.filters
  sort.value = source.sort
  chartSettings.value = source.chart
  page.value = 1
}

// Load the view when another one is chosen, and once the saved views are available.
watch(
  [activeViewId, () => library.loaded],
  () => {
    if (activeViewId.value && library.loaded && !activeView.value) activeViewId.value = ''
    applyView()
  },
  { immediate: true },
)

function confirmDiscard() {
  if (!isDirty.value) return true
  const what = activeView.value ? `the view "${activeView.value.name}"` : 'the table layout'
  return confirm(`Discard unsaved changes to ${what}?`)
}

/** Switches views from the menu, asking first when there are unsaved changes. */
function chooseView(event) {
  const id = event.target.value
  if (id === activeViewId.value) return
  if (!confirmDiscard()) {
    event.target.value = activeViewId.value
    return
  }
  activeViewId.value = id
}

/** Stores the working state in the selected view (or asks for a name when none is selected). */
function saveView() {
  const view = activeView.value
  if (!view) {
    openNameDialog('saveAs')
    return
  }
  const index = library.views.findIndex((v) => v.id === view.id)
  library.views[index] = { ...view, ...viewFields(view) }
}

/** View fields for the working state. */
function viewFields(previous = null) {
  const current = layout.value
  // Keep columns the view lists that this dataset doesn't have, so they stay in other datasets.
  const available = new Set(columns.value)
  const missing = (previous?.columns ?? []).filter((c) => !available.has(c))
  return {
    columns: [...current.columns, ...missing],
    frozenLeft: current.frozenLeft,
    frozenRight: current.frozenRight,
    positions: [...current.positions],
    filters: current.filters.map((f) => ({ ...f })),
    sort: current.sort ? { ...current.sort } : null,
    chart: normalizeChartSettings(current.chart),
  }
}

function saveAsNew(name) {
  const view = { ...newView(name), ...viewFields(activeView.value) }
  library.views.push(view)
  // Switching to the new view reloads the same layout, now saved.
  activeViewId.value = view.id
}

/** A new view with the default layout (every column, no filters), opened right away. */
function createView(name) {
  const view = {
    ...newView(name),
    columns: [...columns.value],
    frozenLeft: [...DEFAULT_FROZEN_LEFT],
    frozenRight: [...DEFAULT_FROZEN_RIGHT],
  }
  library.views.push(view)
  activeViewId.value = view.id
}

/** Renames the open view (its layout and unsaved changes are kept as they are). */
function renameView(name) {
  const view = activeView.value
  if (!view) return
  const index = library.views.findIndex((v) => v.id === view.id)
  library.views[index] = { ...view, name }
}

// Name popup for a new view, renaming the open one, or saving the layout as a new view.
const nameDialog = ref({ open: false, mode: 'saveAs' })
const NAME_DIALOG = {
  new: { title: 'New view', submit: 'Create' },
  rename: { title: 'Rename view', submit: 'Rename' },
  saveAs: { title: 'Save as new view', submit: 'Save' },
}

function openNameDialog(mode) {
  // A new view replaces what the table shows; unsaved changes would be lost.
  if (mode === 'new' && !confirmDiscard()) return
  nameDialog.value = { open: true, mode }
}

const nameDialogInitial = computed(() => {
  const view = activeView.value
  if (nameDialog.value.mode === 'rename') return view?.name ?? ''
  if (nameDialog.value.mode === 'saveAs') return view ? `${view.name} copy` : 'New view'
  return 'New view'
})

function onNameSave(name) {
  const mode = nameDialog.value.mode
  if (mode === 'new') createView(name)
  else if (mode === 'rename') renameView(name)
  else saveAsNew(name)
}

// Autosave: changes to the open view are saved as they are made. Remembered in this browser.
const autosave = usePreference('autosaveViews', false, (v) => typeof v === 'boolean')
watch([layout, autosave], () => {
  if (autosave.value && activeView.value && isDirty.value) saveView()
})

function revertView() {
  if (confirmDiscard()) applyView()
}

/** Downloads the open view as shown, including unsaved changes. */
function exportView() {
  const view = activeView.value
  if (!view) return
  downloadJson(jsonFileName(view.name, 'view'), viewsFile([{ ...view, ...viewFields(view) }]))
}

async function importViews() {
  const file = await pickFile()
  if (!file) return
  const wasDirty = isDirty.value
  try {
    const { added, replaced } = await library.importViews(file)
    message.value = `Imported ${added} new view${added === 1 ? '' : 's'}${replaced ? `, updated ${replaced}` : ''}.`
    // An imported copy of the open view replaces it; show it unless there are unsaved changes.
    if (!wasDirty) applyView()
  } catch (error) {
    message.value = `Import failed: ${error.message}`
  }
}

function deleteView() {
  const view = activeView.value
  if (!view || !confirm(`Delete the view "${view.name}"? This cannot be undone.`)) return
  library.deleteView(view.id)
  activeViewId.value = ''
}

// Leaving the Analyse page would lose unsaved changes to a saved view; switching to the Charts tab
// keeps them (the tab stays alive). Checked for every navigation, as the Charts tab may be the one
// open when the page is left.
const isAnalysePath = (path) => path === '/analyse' || path.startsWith('/analyse/')
const removeLeaveGuard = router.beforeEach((to, from) => {
  if (!isAnalysePath(from.path) || isAnalysePath(to.path)) return true
  return !activeView.value || confirmDiscard()
})
onBeforeUnmount(removeLeaveGuard)

/** Puts the open view in the URL (or removes it), while the Table tab is shown. */
function syncViewQuery(id) {
  if (route.name !== 'analyse-table' || (route.query.view ?? '') === id) return
  const query = { ...route.query }
  if (id) query.view = id
  else delete query.view
  router.replace({ query })
}

watch(activeViewId, (id) => {
  writePreference('analyseView', id)
  syncViewQuery(id)
})
// The other tabs don't keep the view in the URL; put it back when returning.
onActivated(() => syncViewQuery(activeViewId.value))

function frozenSide(col) {
  if (frozenLeft.value.includes(col)) return 'left'
  if (frozenRight.value.includes(col)) return 'right'
  return null
}

/** Freezes a column to a side; choosing the side it is already frozen to unfreezes it. */
function toggleFreeze(col, side) {
  const current = frozenSide(col)
  frozenLeft.value = frozenLeft.value.filter((c) => c !== col)
  frozenRight.value = frozenRight.value.filter((c) => c !== col)
  if (current === side) return
  if (side === 'left') frozenLeft.value = [...frozenLeft.value, col]
  else frozenRight.value = [...frozenRight.value, col]
}

/**
 * Moves a column next to another one (before or after it). It joins the target's side: frozen
 * left, frozen right or the scrolling middle.
 */
function moveColumn(col, target, after) {
  if (col === target) return
  const insert = (list) => {
    const result = list.filter((c) => c !== col)
    const index = result.indexOf(target)
    result.splice(index === -1 ? result.length : after ? index + 1 : index, 0, col)
    return result
  }
  const side = frozenSide(target)
  frozenLeft.value =
    side === 'left' ? insert(frozenLeft.value) : frozenLeft.value.filter((c) => c !== col)
  frozenRight.value =
    side === 'right' ? insert(frozenRight.value) : frozenRight.value.filter((c) => c !== col)
  // The scrolling order changes too, which is also where the column returns when unfrozen.
  shownColumns.value = insert(shownColumns.value ?? columns.value)
}

function onHeaderDragStart(event, col) {
  draggedColumn.value = col
  event.dataTransfer.setData(COLUMN_DRAG_TYPE, col)
  event.dataTransfer.effectAllowed = 'move'
}

function onHeaderDragOver(event, col) {
  if (!draggedColumn.value || !event.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  if (col === draggedColumn.value) {
    dropMark.value = null
    return
  }
  // Before or after the hovered column, depending on which half the pointer is in.
  const rect = event.currentTarget.getBoundingClientRect()
  dropMark.value = { col, after: event.clientX > rect.left + rect.width / 2 }
}

function onHeaderDrop(event) {
  const col = draggedColumn.value
  const mark = dropMark.value
  onHeaderDragEnd()
  if (!col || !mark) return
  event.preventDefault()
  moveColumn(col, mark.col, mark.after)
}

function onHeaderDragEnd() {
  draggedColumn.value = null
  dropMark.value = null
}

function frozenClass(col) {
  const side = frozenSide(col)
  return {
    'frozen-left': side === 'left',
    'frozen-right': side === 'right',
    'frozen-edge-left': side === 'left' && col === visibleLeft.value.at(-1),
    'frozen-edge-right': side === 'right' && col === visibleRight.value[0],
  }
}

function stickyStyle(col) {
  const offset = stickyOffsets.value[col]
  if (offset == null) return undefined
  return frozenSide(col) === 'left' ? { left: `${offset}px` } : { right: `${offset}px` }
}

function headerStyle(col, index) {
  const style = { ...stickyStyle(col), ...widthStyle(col) }
  if (rotateHeaders.value) {
    // Rotated labels overflow into the next columns' headers, so earlier headers are stacked
    // above later ones; frozen headers stay above the scrolling ones.
    const count = displayColumns.value.length
    style.zIndex = (frozenSide(col) ? count + 10 : 2) + count - index
  }
  return style
}

const fillerStyle = computed(() => ({
  width: `${headerOverhang.value}px`,
  minWidth: `${headerOverhang.value}px`,
  right: visibleRight.value.length ? '0px' : undefined,
  // Between the scrolling headers (z <= count + 2) and the frozen ones (z >= count + 11):
  // scrolling labels are hidden in the gap, while the last frozen band can still lean over it.
  zIndex: visibleRight.value.length ? displayColumns.value.length + 10 : undefined,
}))

// Header cells are observed so offsets follow column width changes (e.g. when paging).
const resizeObserver = new ResizeObserver(() => updateLayout())

function setHeaderCell(col, el) {
  const previous = headerCells.get(col)
  if (previous === el) return
  if (previous) resizeObserver.unobserve(previous)
  if (el) {
    headerCells.set(col, el)
    resizeObserver.observe(el)
  } else {
    headerCells.delete(col)
  }
}

function updateLayout() {
  if (rotateHeaders.value) measureRotatedHeaders()

  const offsets = {}
  let left = shortlistHeader.value?.getBoundingClientRect().width ?? 0
  for (const col of visibleLeft.value) {
    offsets[col] = left
    left += headerCells.get(col)?.getBoundingClientRect().width ?? 0
  }
  let right = rotateHeaders.value ? headerOverhang.value : 0
  for (const col of [...visibleRight.value].reverse()) {
    offsets[col] = right
    right += headerCells.get(col)?.getBoundingClientRect().width ?? 0
  }
  stickyOffsets.value = offsets

  // Column widths, so the floating comparison row lines up with the table.
  const widths = {}
  for (const [col, th] of headerCells) widths[col] = th.getBoundingClientRect().width
  columnWidths.value = {
    shortlist: shortlistHeader.value?.getBoundingClientRect().width ?? 0,
    columns: widths,
    table: mainTable.value?.getBoundingClientRect().width ?? 0,
  }
  positionFloat()
}

/**
 * Places the floating comparison row just above the hovered row, or just below it when there is
 * no room above (it would cover the header). Positions are in the scrolled content of the table
 * wrapper, so the floating row scrolls together with the table.
 */
function positionFloat() {
  const wrap = tableWrap.value
  const tr = hoveredIndex.value == null ? null : tableBody.value?.rows[hoveredIndex.value]
  if (!showFloat.value || !wrap || !tr || !floatEl.value) {
    floatTop.value = null
    return
  }
  const height = floatEl.value.offsetHeight
  const wrapRect = wrap.getBoundingClientRect()
  const rowRect = tr.getBoundingClientRect()
  const rowTop = rowRect.top - wrapRect.top - wrap.clientTop + wrap.scrollTop
  const headerBottom = wrap.scrollTop + (mainTable.value?.tHead?.offsetHeight ?? 0)
  floatTop.value =
    rowTop - height >= headerBottom ? rowTop - height - 5 : rowTop + rowRect.height + 5
}

function onBodyPointerOver(event) {
  const tr = event.target.closest('tr')
  hoveredIndex.value = tr && tr.parentElement === tableBody.value ? tr.sectionRowIndex : null
}

/** Sizes the header row to fit the longest rotated label (layout sizes ignore transforms). */
function measureRotatedHeaders() {
  const sin = Math.sin(HEADER_ANGLE)
  const cos = Math.cos(HEADER_ANGLE)
  const inners = [...headerCells.values()].map((th) => th.querySelector('.th-inner'))
  const present = inners.filter(Boolean)

  // Bands have a fixed length, so release it to read each label's natural size.
  // Write all, read all, then reset all, to keep it to a single layout pass.
  for (const el of present) el.style.width = 'max-content'
  let longest = 0
  let thickness = 0
  for (const el of present) {
    longest = Math.max(longest, el.offsetWidth)
    thickness = Math.max(thickness, el.offsetHeight)
  }
  for (const el of present) el.style.width = ''

  // A band of this length, turned around its bottom corner, ends exactly at the top edge.
  labelLength.value = Math.ceil(longest) + 8
  headerHeight.value = Math.ceil(labelLength.value * sin + thickness * cos)

  // The last band leans past its column; reserve the part that sticks out.
  const lastCol = displayColumns.value.at(-1)
  const lastTh = lastCol && headerCells.get(lastCol)
  const bandStart = 8 // matches `left: calc(50% + 0.5em)` in the styles, roughly
  headerOverhang.value = lastTh
    ? Math.max(0, Math.ceil(labelLength.value * cos + bandStart - lastTh.offsetWidth / 2)) + 4
    : 0
}

watch([displayColumns, pageRows, rotateHeaders], () => nextTick(updateLayout))
watch([hoveredIndex, showFloat], () => nextTick(positionFloat))
// Another page shows other rows; the floating row waits for the pointer to move again.
watch(pageRows, () => (hoveredIndex.value = null))

function toggleSort(col) {
  if (sortKey.value === col) {
    sortDir.value = -sortDir.value
  } else {
    sortKey.value = col
    sortDir.value = 1
  }
  page.value = 1
}

// Another dataset starts with an empty search on the first page.
watch(selectedId, () => {
  search.value = ''
  page.value = 1
})

watch([search, shortlistOnly], () => {
  page.value = 1
})

onBeforeUnmount(() => {
  resizeObserver.disconnect()
  clearTimeout(messageTimer)
})
</script>

<template>
  <template v-if="imports.length">
    <div class="toolbar">
      <div class="stick-left">
        <DatasetControls />
      </div>
      <div class="stick-right">
        <label>
          View
          <select :value="activeViewId" @change="chooseView">
            <option value="">All columns</option>
            <option v-for="v in library.views" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
        </label>
        <button
          type="button"
          class="short filters-button"
          :class="{ active: filterCount }"
          title="Positions and conditions"
          @click="filtersOpen = true"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3h12l-4.5 5.5V13l-3-1.5v-3z" />
          </svg>
          Filters<span v-if="filterCount" class="count">{{ filterCount }}</span>
        </button>
        <ActionMenu label="View actions">
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            title="Start a view with every column and no filters"
            @click="openNameDialog('new')"
          >
            New view...
          </button>
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            :disabled="!activeView"
            title="Rename this view"
            @click="openNameDialog('rename')"
          >
            Rename view...
          </button>
          <hr />
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            :disabled="!isDirty"
            :title="
              activeView ? `Save changes to &quot;${activeView.name}&quot;` : 'Save as a new view'
            "
            @click="saveView"
          >
            Save view
          </button>
          <button type="button" class="menu-item" role="menuitem" @click="openNameDialog('saveAs')">
            Save view as...
          </button>
          <button
            type="button"
            class="menu-item"
            role="menuitemcheckbox"
            :aria-checked="autosave"
            title="Save changes to the open view as they are made"
            @click="autosave = !autosave"
          >
            <span class="check" :class="{ on: autosave }" aria-hidden="true"></span>
            Autosave view
          </button>
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            :disabled="!isDirty"
            title="Undo all changes since the last save"
            @click="revertView"
          >
            Revert view
          </button>
          <hr />
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            title="Add views from a JSON file"
            @click="importViews"
          >
            Import view(s)
          </button>
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            :disabled="!activeView"
            title="Download this view as a JSON file, including unsaved changes"
            @click="exportView"
          >
            Export current view
          </button>
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            :disabled="!library.views.length"
            title="Download all saved views as a JSON file"
            @click="library.exportViews"
          >
            Export all views
          </button>
          <hr />
          <button
            type="button"
            class="menu-item danger"
            role="menuitem"
            :disabled="!activeView"
            title="Delete this view"
            @click="deleteView"
          >
            Delete view
          </button>
        </ActionMenu>
        <span v-if="isDirty" class="unsaved" title="Unsaved changes">●</span>
      </div>
    </div>

    <div class="toolbar">
      <div class="stick-left">
        <input v-model="search" type="search" placeholder="Search all columns" />

        <TeamSelect v-model="selectedTeam" :teams="teams" />

        <label class="checkbox">
          <input v-model="shortlistOnly" type="checkbox" />
          Show shortlisted only
        </label>

        <ColumnPicker
          v-model="hiddenColumns"
          :columns="columns"
          :label="(col) => columnLabel(col, columnInfo[col])"
        />

        <label class="checkbox">
          <input v-model="rotateHeaders" type="checkbox" />
          Rotate headers
        </label>
      </div>
      <div class="stick-center"></div>
      <div class="stick-right">
        <template v-if="comparePlayers.length">
          <PlayerSelect
            v-for="(label, slot) in COMPARE_SLOTS"
            :key="label"
            :class="`compare-slot slot-${label.toLowerCase()}`"
            :model-value="compare.ids.value[slot]"
            :players="comparePlayers"
            :label="slot === 0 ? `Player ${label}` : label"
            :padding-left="true"
            @update:model-value="(rowId) => compare.setSlot(slot, rowId)"
          />
        </template>
        <button
          type="button"
          class="short chart-toggle"
          :class="{ active: chartPanelOpen }"
          :aria-pressed="chartPanelOpen"
          title="Show a chart of the filtered players next to the table"
          @click="chartPanelOpen = !chartPanelOpen"
        >
          Chart
        </button>
      </div>
    </div>

    <p v-if="message" class="message">{{ message }}</p>

    <p v-if="isLoading">Loading...</p>

    <template v-else>
      <div class="table-options">
        <p class="summary">
          Showing {{ pageRows.length }} of {{ sortedRows.length }} rows
          <span v-if="search || filterCount || shortlistOnly || chartSelection"
            >(filtered from {{ rows.length }})</span
          >
        </p>
        <span v-if="chartSelection" class="chart-chip">
          {{ chartSelection.ids.size }} players from chart: {{ chartSelection.label }}
          <span v-if="filterCount" class="note">(view filters set aside)</span>
          <button
            type="button"
            title="Show the view's players again"
            aria-label="Clear the players from the chart"
            @click="chartSelection = null"
          >
            ✕
          </button>
        </span>
      </div>

      <div class="table-area">
        <div ref="tableWrap" class="table-wrap" @pointerleave="hoveredIndex = null">
          <table
            ref="mainTable"
            :class="{ 'rotated-headers': rotateHeaders }"
            :style="
              rotateHeaders
                ? { '--header-height': `${headerHeight}px`, '--label-length': `${labelLength}px` }
                : undefined
            "
          >
            <thead>
              <tr>
                <th
                  ref="shortlistHeader"
                  class="shortlist-col frozen-left"
                  :class="{ 'frozen-edge-left': !visibleLeft.length }"
                  :style="rotateHeaders ? { zIndex: displayColumns.length * 2 + 12 } : undefined"
                  title="Shortlist"
                >
                  <svg class="star" viewBox="0 0 16 16" aria-label="Shortlist">
                    <path :d="STAR_PATH" />
                  </svg>
                </th>
                <th
                  v-for="(col, index) in displayColumns"
                  :key="col"
                  :ref="(el) => setHeaderCell(col, el)"
                  :class="{
                    sorted: sortKey === col,
                    dragged: draggedColumn === col,
                    'drop-before': dropMark?.col === col && !dropMark.after,
                    'drop-after': dropMark?.col === col && dropMark.after,
                    notes: isNotesColumn(col),
                    ...frozenClass(col),
                  }"
                  :style="headerStyle(col, index)"
                  :title="headerTitle(col)"
                  draggable="true"
                  @click="toggleSort(col)"
                  @dragstart="onHeaderDragStart($event, col)"
                  @dragover="onHeaderDragOver($event, col)"
                  @drop="onHeaderDrop"
                  @dragend="onHeaderDragEnd"
                >
                  <div class="th-inner">
                    <span>
                      {{ columnLabel(col, columnInfo[col]) }}
                      <span v-if="sortKey === col">{{ sortDir === 1 ? '▲' : '▼' }}</span>
                    </span>
                    <span class="pins">
                      <button
                        type="button"
                        class="pin"
                        :class="{ active: frozenSide(col) === 'left' }"
                        :title="frozenSide(col) === 'left' ? 'Unfreeze' : 'Freeze to left'"
                        @click.stop="toggleFreeze(col, 'left')"
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M2 2v12M14 8H5M8 5 5 8l3 3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="pin"
                        :class="{ active: frozenSide(col) === 'right' }"
                        :title="frozenSide(col) === 'right' ? 'Unfreeze' : 'Freeze to right'"
                        @click.stop="toggleFreeze(col, 'right')"
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M14 2v12M2 8h9M8 5l3 3-3 3" />
                        </svg>
                      </button>
                    </span>
                  </div>
                </th>
                <th
                  v-if="rotateHeaders"
                  class="filler"
                  :class="{ 'frozen-right': visibleRight.length }"
                  :style="fillerStyle"
                ></th>
              </tr>
            </thead>
            <tbody ref="tableBody" @pointerover="onBodyPointerOver">
              <tr v-for="(row, i) in pageRows" :key="i" :class="{ 'team-row': isTeamRow(row) }">
                <td
                  class="shortlist-col frozen-left"
                  :class="{ 'frozen-edge-left': !visibleLeft.length }"
                >
                  <div class="row-actions">
                    <button
                      type="button"
                      class="star-toggle"
                      :class="{ active: isShortlisted(row) }"
                      :aria-pressed="isShortlisted(row)"
                      :title="isShortlisted(row) ? 'Remove from shortlist' : 'Add to shortlist'"
                      @click="toggleShortlist(row)"
                    >
                      <svg class="star" viewBox="0 0 16 16" aria-hidden="true">
                        <path :d="STAR_PATH" />
                      </svg>
                    </button>
                    <button
                      v-if="comparePlayers.length"
                      type="button"
                      class="compare-toggle"
                      :class="compareSlotClass(row)"
                      :aria-pressed="compare.slotOf(row[ROW_ID]) !== -1"
                      :title="compareTitle(row)"
                      @click="compare.toggle(row[ROW_ID])"
                    >
                      <span v-if="compare.slotOf(row[ROW_ID]) !== -1">{{
                        COMPARE_SLOTS[compare.slotOf(row[ROW_ID])]
                      }}</span>
                      <span v-else class="vs" aria-hidden="true">VS</span>
                    </button>
                  </div>
                </td>
                <td
                  v-for="col in displayColumns"
                  :key="col"
                  :class="{
                    numeric: columnInfo[col]?.type === 'number',
                    boolean: columnInfo[col]?.type === 'boolean',
                    notes: isNotesColumn(col),
                    ...frozenClass(col),
                  }"
                  :style="cellStyle(col, row[col])"
                >
                  <div v-if="isNotesColumn(col)" class="notes-cell">
                    <span class="notes-text" :title="row[col] || undefined">{{ row[col] }}</span>
                    <button
                      type="button"
                      class="notes-edit"
                      title="Edit notes"
                      @click="editNotes(row)"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M8.5 14.5h-6v-13h8v3" />
                        <path d="M4.5 5h4M4.5 7.5h3M4.5 10h2" />
                        <path d="M13 6.5l1.5 1.5-5 5-2 .5.5-2z" />
                      </svg>
                    </button>
                  </div>
                  <template v-else>{{ formatCell(row[col]) }}</template>
                </td>
                <td
                  v-if="rotateHeaders"
                  class="filler"
                  :class="{ 'frozen-right': visibleRight.length }"
                  :style="{ ...fillerStyle, zIndex: undefined }"
                ></td>
              </tr>
            </tbody>
          </table>

          <!-- The compared player's row, floating next to the hovered row. It ignores the pointer,
             so moving onto it hovers the row underneath and the floating row follows. -->
          <div
            v-if="showFloat"
            ref="floatEl"
            class="compare-float"
            :class="{ placed: floatTop != null }"
            :style="{
              top: floatTop != null ? `${floatTop}px` : undefined,
              width: `${columnWidths.table}px`,
            }"
            aria-hidden="true"
          >
            <table>
              <colgroup>
                <col :style="floatColumnStyle(columnWidths.shortlist)" />
                <col
                  v-for="col in displayColumns"
                  :key="col"
                  :style="floatColumnStyle(columnWidths.columns[col])"
                />
                <col v-if="rotateHeaders" :style="floatColumnStyle(headerOverhang)" />
              </colgroup>
              <tbody>
                <tr>
                  <td
                    class="shortlist-col frozen-left"
                    :class="{ 'frozen-edge-left': !visibleLeft.length }"
                  >
                    <span class="star-toggle" :class="{ active: isShortlisted(compareRow) }">
                      <svg class="star" viewBox="0 0 16 16">
                        <path :d="STAR_PATH" />
                      </svg>
                    </span>
                  </td>
                  <td
                    v-for="col in displayColumns"
                    :key="col"
                    :class="{
                      numeric: columnInfo[col]?.type === 'number',
                      boolean: columnInfo[col]?.type === 'boolean',
                      ...frozenClass(col),
                    }"
                    :style="cellStyle(col, compareRow[col])"
                  >
                    {{ formatCell(compareRow[col]) }}
                  </td>
                  <td
                    v-if="rotateHeaders"
                    class="filler"
                    :class="{ 'frozen-right': visibleRight.length }"
                    :style="{ ...fillerStyle, zIndex: undefined }"
                  ></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="pager" v-if="sortedRows.length > PAGE_SIZES[0]">
          <button type="button" :disabled="page === 1" @click="page = 1">«</button>
          <button type="button" :disabled="page === 1" @click="page--">‹</button>
          <span>Page {{ page }} of {{ pageCount }}</span>
          <button type="button" :disabled="page === pageCount" @click="page++">›</button>
          <button type="button" :disabled="page === pageCount" @click="page = pageCount">»</button>
          <label class="page-size">
            Rows per page
            <select :value="pageSize" @change="changePageSize(Number($event.target.value))">
              <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
            </select>
          </label>
        </div>

        <ChartSidePanel
          v-if="chartPanelOpen"
          class="side-chart"
          :columns="columns"
          :column-info="columnInfo"
          :filtered-rows="filteredRows"
          :positions-rows="chartPositionsRows"
          :players="chartPlayers"
          v-model:settings="chartSettings"
          @close="chartPanelOpen = false"
        />
      </div>
    </template>

    <ViewFiltersDialog
      v-model:open="filtersOpen"
      v-model:positions="positions"
      v-model:filters="filters"
      :columns="columns"
      :column-info="columnInfo"
      :match-count="viewRows.length"
      :total-count="rows.length"
    />
    <NotesDialog
      v-model:open="notesOpen"
      :title="notesRow?.[PLAYER_COLUMN] ? `Notes: ${notesRow[PLAYER_COLUMN]}` : 'Notes'"
      :value="String(notesRow?.[NOTES_COLUMN] ?? '')"
      @save="saveNotes"
    />
    <SaveViewDialog
      v-model:open="nameDialog.open"
      :title="NAME_DIALOG[nameDialog.mode].title"
      :submit-label="NAME_DIALOG[nameDialog.mode].submit"
      :existing-names="
        library.views
          .filter((v) => nameDialog.mode !== 'rename' || v !== activeView)
          .map((v) => v.name)
      "
      :initial-name="nameDialogInitial"
      @save="onNameSave"
    />
  </template>
</template>

<style lang="scss" scoped>
@use 'sass:color';

button.filters-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;

  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  &.active svg {
    color: $accent-color;
  }

  .count {
    min-width: 1.1rem;
    padding: 0 0.3rem;
    font-size: 0.75rem;
    line-height: 1.1rem;
    text-align: center;
    background: color.adjust($accent-color, $lightness: -10%);
    border-radius: 0.55rem;
  }
}

// The compare selects' labels in their slot's chart colour.
.compare-slot.slot-a :deep(.label) {
  color: $accent-color;
}

.compare-slot.slot-b :deep(.label) {
  color: $secondary-accent-color;
}

button.chart-toggle.active {
  color: $accent-color;
}

// Checkbox of the Autosave menu item.
.check {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  border-radius: 3px;
  opacity: 0.7;

  &.on {
    background: $accent-color;
    border-color: $accent-color;
    opacity: 1;

    &::after {
      content: '';
      width: 4px;
      height: 8px;
      margin-top: -2px;
      border: solid $background-color;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
  }
}

.unsaved {
  color: #f2c94c;
  font-size: 0.7rem;
}

.message {
  margin: 0 0 0.75rem;
  opacity: 0.85;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;

  .stick-left,
  .stick-right,
  .stick-center {
    display: flex;
    gap: 0.35rem;
  }
  .stick-right {
    margin-left: auto;
  }
  .stick-center {
    margin-left: auto;
    margin-right: auto;
  }
}

.table-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 0.5rem;
}

.summary {
  margin: 0;
  opacity: 0.8;
}

// Players picked on a chart, listed instead of the view's filtered players.
.chart-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-right: auto;
  padding: 0.1rem 0.25rem 0.1rem 0.6rem;
  font-size: 0.85rem;
  background: color.adjust($accent-color, $lightness: -30%);
  border: 1px solid $accent-color;
  border-radius: 1rem;

  .note {
    opacity: 0.75;
  }

  button {
    padding: 0 0.4rem;
    line-height: 1.4rem;
    border-radius: 1rem;
  }
}

.checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
}

// The table, with the chart panel beside it when shown (below it on narrow screens).
// The table (full width) with the pager below it. The chart panel floats over the table's top
// right corner, clear of its vertical scrollbar.
.table-area {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

// Under .table-area, to win over the panel's own max-width.
.table-area .side-chart {
  position: absolute;
  z-index: 150;
  top: 0.5rem;
  right: 1.25rem;
  // The panel sets its own width (one or more square chart columns); butterfly columns wrap when
  // the screen is narrower. Taller than the table area: the panel scrolls.
  max-width: calc(100% - 1.75rem);
  max-height: calc(100% - 0.5rem);
  overflow-y: auto;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
}

.table-wrap {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  align-items: start;
  overflow: auto;
  border: 1px solid color.adjust($background-color, $lightness: 10%);
  display: flex;
}

.table-wrap {
  position: relative;
  // For the comparison colours, which are set inline (see compareStyle).
  --compare-better: #{$compare-better-color};
  --compare-worse: #{$compare-worse-color};
}

// Floating comparison row: a one-row table with the main table's column widths, lifted off the
// table with a shadow. Below the sticky header (z-index 2+) but above the body cells.
.compare-float {
  position: absolute;
  z-index: 100;
  left: 0;
  visibility: hidden;
  pointer-events: none;
  box-shadow:
    0 0 0 1px color.adjust($background-color, $lightness: 30%),
    0 5px 10px color.adjust($background-color, $lightness: -5%);

  &.placed {
    visibility: visible;
    transition: top 0.08s ease-out;
  }

  table {
    width: 100%;
    min-width: 0;
    table-layout: fixed;
  }

  td {
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    --cell-background: #{color.adjust($background-color, $lightness: 9%)};
    border-bottom: 0;
  }

  .star-toggle {
    display: inline-block;
  }
}

table {
  min-width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  white-space: nowrap;
}

th,
td {
  padding: 0.25rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid color.adjust($background-color, $lightness: 6%);
}

th {
  min-width: calc(33px + 1rem);
  position: sticky;
  z-index: 2;
  top: 0;
  font-weight: 500;
  background: color.adjust($background-color, $lightness: 6%);
  cursor: pointer;
  user-select: none;

  &.sorted {
    background: color.adjust($background-color, $lightness: 12%);
  }

  // Header drag and drop: the dragged column fades, a bar marks where it would go.
  &.dragged {
    opacity: 0.5;
  }

  &.drop-before {
    box-shadow: inset 3px 0 0 #7fb7ff;
  }

  &.drop-after {
    box-shadow: inset -3px 0 0 #7fb7ff;
  }
}

// Opaque cells, so frozen columns cover the scrolling middle. Rows change the background through
// --cell-background, which the comparison colours are mixed into.
td {
  --cell-background: #{$background-color};
  background: var(--cell-background);
}

.th-inner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pins {
  right: 0.5rem;
  display: inline-flex;
  gap: 1px;
  opacity: 0;
  position: absolute;
  background: color.adjust($background-color, $lightness: 6%);
}

th:hover .pins {
  opacity: 1;
}
th.frozen-left .pins,
th.frozen-right .pins {
  opacity: 1;
  margin-left: auto;
  right: auto;
  position: static;
}

.pin {
  display: inline-flex;
  padding: 2px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 3px;
  opacity: 0.45;
  cursor: pointer;

  svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &:hover {
    background: color.adjust($background-color, $lightness: 18%);
    opacity: 1;
  }

  &.active {
    color: #7fb7ff;
    opacity: 1;
  }
}

// Frozen columns stick to the table edges while the middle scrolls horizontally.
.frozen-left,
.frozen-right {
  position: sticky;
  z-index: 1;
}

th.frozen-left,
th.frozen-right {
  z-index: 3;
}

.frozen-edge-left {
  box-shadow: inset -1px 0 0 color.adjust($background-color, $lightness: 20%);
}

.frozen-edge-right {
  box-shadow: inset 1px 0 0 color.adjust($background-color, $lightness: 20%);
}

// Rotated headers: the label is taken out of the layout and turned 70° counter-clockwise
// around its bottom-left corner, so column widths follow the values instead of the labels.
.rotated-headers {
  th {
    height: var(--header-height);
    min-width: 1.75rem;
    padding: 0;
    vertical-align: bottom;
  }

  // The cell itself keeps the plain header colour; the rotated band shows sorting and hover.
  th.sorted {
    background: color.adjust($background-color, $lightness: 6%);
  }

  .th-inner {
    position: absolute;
    bottom: 0;
    left: calc(50% + 1em);
    box-sizing: border-box;
    width: var(--label-length);
    padding: 0.15rem 0.4rem;
    gap: 0.35rem;
    border-radius: 4px;
    transform: rotate(-90deg);
    transform-origin: 0 100%;
  }

  th:hover .th-inner {
    background: color.adjust($background-color, $lightness: 10%);
  }

  th.sorted .th-inner {
    background: color.adjust($background-color, $lightness: 16%);
  }
}

th.filler,
td.filler {
  padding: 0;
  cursor: default;
}

// Shortlist column: a star per player, always first, not sortable or movable.
th.shortlist-col,
td.shortlist-col {
  left: 0;
  width: 1px;
  padding: 0 0.35rem;
  text-align: center;
  cursor: default;
}

th.shortlist-col .star {
  width: 12px;
  height: 12px;
  vertical-align: middle;
  fill: currentColor;
  opacity: 0.6;
}

.star-toggle {
  display: block;
  padding: 2px;
  background: none;
  border: 0;
  border-radius: 3px;
  cursor: pointer;

  .star {
    width: 16px;
    height: 16px;
    fill: #fff;
    opacity: 0.15;
  }

  &.active .star {
    fill: #ffc83d;
    opacity: 1;
  }

  &:hover:not(.active) .star {
    opacity: 0.5;
  }
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

// Compare button: a small outlined "VS", or the player's slot letter (A in the main chart colour, B
// in the second one) when they are compared.
.compare-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  background: none;
  border: 0;
  border-radius: 50%;
  opacity: 0.25;
  cursor: pointer;

  .vs {
    padding: 0 2px;
    font-size: 0.55rem;
    letter-spacing: 0.02em;
    line-height: 0.75rem;
    border: 1px solid currentColor;
    border-radius: 3px;
  }

  &:hover {
    opacity: 0.7;
  }

  &.slot-a,
  &.slot-b {
    color: $background-color;
    opacity: 1;
  }

  &.slot-a {
    background: $accent-color;
  }

  &.slot-b {
    background: $secondary-accent-color;
  }
}

td.numeric {
  text-align: center;
}

td.boolean {
  text-align: center;
}

// Fixed width (set inline): the start of the notes, then the edit button.
th.notes,
td.notes {
  box-sizing: border-box;
}

// Tighter header, so the label, sort arrow and both pins fit in the fixed width.
table:not(.rotated-headers) th.notes {
  padding-right: 0.25rem;

  .th-inner {
    gap: 0.25rem;
  }
}

.notes-cell {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.notes-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-edit {
  display: inline-flex;
  flex-shrink: 0;
  padding: 2px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 3px;
  opacity: 0.55;
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &:hover {
    background: color.adjust($background-color, $lightness: 18%);
    opacity: 1;
  }
}

tbody tr:hover td {
  --cell-background: #{color.adjust($background-color, $lightness: 4%)};
}

// Players of the selected team: tinted cells and an accent bar on the first column.
$team-accent: #ffd166;

tbody tr.team-row {
  td {
    --cell-background: #{color-mix(in srgb, $team-accent 14%, $background-color)};
  }

  &:hover td {
    --cell-background: #{color-mix(in srgb, $team-accent 22%, $background-color)};
  }

  td:first-child {
    box-shadow: inset 3px 0 0 $team-accent;
  }
}

.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.page-size {
  margin-left: 1rem;
}
</style>
