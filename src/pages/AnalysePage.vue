<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import ActionMenu from '@/components/ActionMenu.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import CSVFileInput from '@/components/CSVFileInput.vue'
import NotesDialog from '@/components/NotesDialog.vue'
import SaveViewDialog from '@/components/SaveViewDialog.vue'
import TeamSelect from '@/components/TeamSelect.vue'
import ViewFiltersDialog from '@/components/ViewFiltersDialog.vue'
import {
  deleteImport,
  getImports,
  getRows,
  getStats,
  ROW_ID,
  updateImport,
  updateRowValue,
} from '@/services/db'
import { downloadJson, jsonFileName, pickFile } from '@/services/fileTransfer'
import { computeMetrics } from '@/services/metrics'
import { NA, NOTES_COLUMN } from '@/services/transform'
import { newView, viewRowFilter, viewsFile } from '@/services/views'
import { useLibraryStore } from '@/stores/library'
import { columnLabel } from '@/utils/columns'
import { readPreference, usePreference, writePreference } from '@/utils/preferences'

const PAGE_SIZES = [15, 20, 30, 50, 100]

// Columns frozen to the table edges by default (raw CSV / derived column names).
const DEFAULT_FROZEN_LEFT = ['Player', 'Club']
const DEFAULT_FROZEN_RIGHT = [NOTES_COLUMN]

// Width of the Notes column in px; longer notes are cut off (the full text is in a tooltip).
const NOTES_COLUMN_WIDTH = 100

// Column holding each player's team.
const TEAM_COLUMN = 'Club'
// Column holding each player's name.
const PLAYER_COLUMN = 'Player'

const HEADER_ANGLE = (90 * Math.PI) / 180

const COLUMN_DRAG_TYPE = 'application/x-fm-column'

const STAR_PATH = 'M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.4l-4.2 2.4 1-4.6L1.3 6l4.7-.5z'

// Where the app is served from, for links to files in public/ (e.g. '/' or '/fm/').
const BASE_URL = import.meta.env.BASE_URL

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
library.load()

const imports = ref([])
const selectedId = ref(null)
const rows = ref([])
const stats = ref({})
const isLoading = ref(false)
const search = ref('')
const sortKey = ref(null)
const sortDir = ref(1)
const page = ref(1)
// Remembered in this browser.
const pageSize = usePreference('pageSize', PAGE_SIZES[0], (v) => PAGE_SIZES.includes(v))
// The table shows a working copy of the selected view (or of the default layout when none is
// selected). Columns are set up in the table itself, positions, conditions and the default sort
// in the Filters dialog. Save writes the copy back to the view, Revert reloads it.
// Visible columns in order; null = every column of the dataset.
const shownColumns = ref(null)
const frozenLeft = ref([...DEFAULT_FROZEN_LEFT])
const frozenRight = ref([...DEFAULT_FROZEN_RIGHT])
const positions = ref([])
const filters = ref([])
const filtersOpen = ref(false)
const saveAsOpen = ref(false)
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

const selectedImport = computed(() => imports.value.find((i) => i.id === selectedId.value))
const datasetColumns = computed(() => selectedImport.value?.columns ?? [])

// Shortlisted players of the selected dataset, by row id. Each dataset keeps its own shortlist
// on its import record, apart from the row data (a dataset imported twice has two shortlists).
const shortlistIds = computed(() => new Set(selectedImport.value?.shortlist ?? []))

function isShortlisted(row) {
  return shortlistIds.value.has(row[ROW_ID])
}

async function toggleShortlist(row) {
  const current = selectedImport.value
  const id = row[ROW_ID]
  if (!current || id == null) return
  const next = new Set(shortlistIds.value)
  if (!next.delete(id)) next.add(id)
  const ids = [...next]
  current.shortlist = ids
  try {
    // The plain array: IndexedDB can't store the reactive copy in `current`.
    await updateImport(current.id, { shortlist: ids })
  } catch (error) {
    message.value = `Saving the shortlist failed: ${error.message}`
  }
}

// Custom metrics are computed in memory and shown as extra columns, before the dataset's own.
const metricResult = computed(() =>
  rows.value.length && library.metrics.length
    ? computeMetrics(rows.value, library.metrics, datasetColumns.value)
    : null,
)
const tableRows = computed(() => metricResult.value?.rows ?? rows.value)
const columns = computed(() => [...(metricResult.value?.columns ?? []), ...datasetColumns.value])
const columnInfo = computed(() => ({
  ...selectedImport.value?.columnInfo,
  ...metricResult.value?.columnInfo,
}))
const allStats = computed(() => ({ ...stats.value, ...metricResult.value?.stats }))

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
    filters: source.filters.map((f) => ({ column: f.column, cmp: f.cmp, value: String(f.value) })),
    sort: source.sort,
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
const filterCount = computed(() => activePositions.value.length + filters.value.length)
const rowFilter = computed(() =>
  filterCount.value
    ? viewRowFilter({ positions: activePositions.value, filters: filters.value })
    : null,
)

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

// Rows matching the view's positions and conditions, then also the search box.
const viewRows = computed(() =>
  rowFilter.value ? tableRows.value.filter(rowFilter.value) : tableRows.value,
)
// Then only shortlisted players, when chosen (kept out of viewRows, which the Filters dialog counts).
const listedRows = computed(() =>
  shortlistOnly.value ? viewRows.value.filter(isShortlisted) : viewRows.value,
)
const filteredRows = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return listedRows.value
  return listedRows.value.filter((row) =>
    columns.value.some((col) => {
      const value = formatCell(row[col])
      return value !== '' && value.toLowerCase().includes(term)
    }),
  )
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

function isEmpty(value) {
  return value == null || value === '' || value === NA
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

function formatCell(value) {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? '✓' : ''
  if (value instanceof Date) return dateFormat.format(value)
  if (typeof value === 'number') return numberFormat.format(value)
  return String(value)
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
  const id = notesRow.value?.[ROW_ID]
  // Shown rows can be copies (with metric values added); the loaded row is the one to change.
  const source = rows.value.find((r) => r[ROW_ID] === id)
  if (id == null || !source) return
  try {
    await updateRowValue(id, NOTES_COLUMN, text)
    source[NOTES_COLUMN] = text
  } catch (error) {
    message.value = `Saving the notes failed: ${error.message}`
  }
}

/** Background for metrics with a colour scale: red (lowest) to green (highest). */
function cellStyle(col, value) {
  const style = { ...stickyStyle(col), ...widthStyle(col) }
  if (!columnInfo.value[col]?.colorScale || typeof value !== 'number') return style
  const range = allStats.value[col]
  const span = range ? range.max - range.min : 0
  const progress = span > 0 ? Math.round(((value - range.min) / span) * 100) : 100
  return {
    ...style,
    backgroundColor: `color-mix(in lab, #ff9797, #82ff7d ${progress}%)`,
    color: '#000',
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
    saveAsOpen.value = true
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
  }
}

function saveAsNew(name) {
  const view = { ...newView(name), ...viewFields(activeView.value) }
  library.views.push(view)
  // Switching to the new view reloads the same layout, now saved.
  activeViewId.value = view.id
}

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

// Leaving the page would lose unsaved changes to a saved view.
onBeforeRouteLeave(() => !activeView.value || confirmDiscard())

watch(activeViewId, (id) => {
  writePreference('analyseView', id)
  if ((route.query.view ?? '') === id) return
  const query = { ...route.query }
  if (id) query.view = id
  else delete query.view
  router.replace({ query })
})

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

function toggleSort(col) {
  if (sortKey.value === col) {
    sortDir.value = -sortDir.value
  } else {
    sortKey.value = col
    sortDir.value = 1
  }
  page.value = 1
}

function formatDate(iso) {
  return new Date(iso).toLocaleString()
}

async function loadImports() {
  imports.value = await getImports()
  // The dataset in the URL wins, then the one last used in this browser, then the newest.
  const exists = (id) => imports.value.some((i) => i.id === id)
  const fromQuery = Number(route.query.import)
  const remembered = readPreference('dataset', null)
  if (exists(fromQuery)) selectedId.value = fromQuery
  else if (exists(selectedId.value)) return
  else if (exists(remembered)) selectedId.value = remembered
  else selectedId.value = imports.value[0]?.id ?? null
}

/** Shows a dataset that was just loaded from a CSV file. */
async function onImported(importId) {
  imports.value = await getImports()
  selectedId.value = importId
}

async function removeSelected() {
  const current = selectedImport.value
  if (!current) return
  if (!confirm(`Delete "${current.fileName}" (${current.rowCount} rows)? This cannot be undone.`)) {
    return
  }
  await deleteImport(current.id)
  selectedId.value = null
  router.replace({ query: {} })
  await loadImports()
}

watch(selectedId, async (id) => {
  search.value = ''
  page.value = 1
  rows.value = []
  stats.value = {}
  if (id == null) return
  writePreference('dataset', id)
  if (Number(route.query.import) !== id) router.replace({ query: { ...route.query, import: id } })
  isLoading.value = true
  try {
    const [loadedRows, loadedStats] = await Promise.all([getRows(id), getStats(id)])
    rows.value = loadedRows
    stats.value = loadedStats
  } finally {
    isLoading.value = false
  }
})

watch([search, shortlistOnly], () => {
  page.value = 1
})

onMounted(loadImports)
onBeforeUnmount(() => {
  resizeObserver.disconnect()
  clearTimeout(messageTimer)
})
</script>

<template>
  <h1>Analyse</h1>

  <div v-if="!imports.length" class="empty-state">
    <p>No data saved yet.</p>
    <p>
      Download the
      <a :href="`${BASE_URL}data/Full%20Export%20View.fmf`" download>Full Export View.fmf</a>
      and import it in Football Manager as a starting point. It includes most player stats.
    </p>
    <p>
      Then use
      <a href="https://github.com/ElectroHugin/FM-View-Exporter" target="_blank" rel="noopener"
        >FM View Exporter</a
      >
      to export the players to a CSV file (don't forget to set <code>ScanColumns = true</code> in
      the plugin's config), and load it here:
    </p>
    <CSVFileInput @imported="onImported" />
  </div>

  <template v-else>
    <div class="toolbar">
      <div class="stick-left">
        <label>
          Dataset
          <select v-model="selectedId">
            <option v-for="imp in imports" :key="imp.id" :value="imp.id">
              {{ imp.fileName }} — {{ imp.rowCount }} rows — {{ formatDate(imp.importedAt) }}
            </option>
          </select>
        </label>

        <CSVFileInput @imported="onImported" />
        <button type="button" class="short danger" @click="removeSelected">Delete dataset</button>
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
          title="Positions, conditions and default sort"
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
            :disabled="!isDirty"
            :title="
              activeView ? `Save changes to &quot;${activeView.name}&quot;` : 'Save as a new view'
            "
            @click="saveView"
          >
            Save view
          </button>
          <button type="button" class="menu-item" role="menuitem" @click="saveAsOpen = true">
            Save view as...
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

    <p v-if="message" class="message">{{ message }}</p>

    <p v-if="isLoading">Loading...</p>

    <template v-else>
      <div class="table-options">
        <p class="summary">
          Showing {{ pageRows.length }} of {{ sortedRows.length }} rows
          <span v-if="search || filterCount || shortlistOnly"
            >(filtered from {{ rows.length }})</span
          >
        </p>
      </div>

      <div class="table-wrap">
        <table
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
          <tbody>
            <tr v-for="(row, i) in pageRows" :key="i" :class="{ 'team-row': isTeamRow(row) }">
              <td
                class="shortlist-col frozen-left"
                :class="{ 'frozen-edge-left': !visibleLeft.length }"
              >
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
    </template>

    <ViewFiltersDialog
      v-model:open="filtersOpen"
      v-model:positions="positions"
      v-model:filters="filters"
      v-model:sort="sort"
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
      v-model:open="saveAsOpen"
      :existing-names="library.views.map((v) => v.name)"
      :initial-name="activeView ? `${activeView.name} copy` : 'New view'"
      @save="saveAsNew"
    />
  </template>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.empty-state p {
  margin: 0 0 0.75rem;
}

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
    color: #4fd39a;
  }

  .count {
    min-width: 1.1rem;
    padding: 0 0.3rem;
    font-size: 0.75rem;
    line-height: 1.1rem;
    text-align: center;
    background: #2f9e6e;
    border-radius: 0.55rem;
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
  .stick-right {
    display: flex;
    gap: 0.35rem;
  }
  .stick-right {
    margin-left: auto;
  }
}

.table-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 0.5rem;
}

.summary {
  margin: 0;
  opacity: 0.8;
}

.checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
}

.table-wrap {
  margin-bottom: 1rem;
  overflow: auto;
  border: 1px solid color.adjust($background-color, $lightness: 10%);
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

// Opaque cells, so frozen columns cover the scrolling middle.
td {
  background: $background-color;
}

.th-inner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pins {
  display: inline-flex;
  gap: 1px;
  opacity: 0;
}

th:hover .pins,
th.frozen-left .pins,
th.frozen-right .pins {
  opacity: 1;
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
  background: color.adjust($background-color, $lightness: 4%);
}

// Players of the selected team: tinted cells and an accent bar on the first column.
$team-accent: #ffd166;

tbody tr.team-row {
  td {
    background: color-mix(in srgb, $team-accent 14%, $background-color);
  }

  &:hover td {
    background: color-mix(in srgb, $team-accent 22%, $background-color);
  }

  td:first-child {
    box-shadow: inset 3px 0 0 $team-accent;
  }
}

.pager {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: auto;
}

.page-size {
  margin-left: 1rem;
}
</style>
