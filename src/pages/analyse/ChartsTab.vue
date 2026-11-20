<script setup>
// Charts tab of the Analyse page: dashboards of radar, butterfly and scatter cards. A dashboard's
// positions and conditions apply to all its cards; a card can have its own positions and one player. Like the table's views, the tab shows a
// working copy of the open dashboard: Save writes it back, Revert reloads it, and Autosave saves
// every change. The open dashboard is kept in the URL and remembered in this browser.
import { computed, onActivated, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ActionMenu from '@/components/ActionMenu.vue'
import CardEditorDialog from '@/components/charts/CardEditorDialog.vue'
import DashboardCard from '@/components/charts/DashboardCard.vue'
import DatasetControls from '@/components/DatasetControls.vue'
import SaveViewDialog from '@/components/SaveViewDialog.vue'
import ViewFiltersDialog from '@/components/ViewFiltersDialog.vue'
import { RADAR_MAX_METRICS } from '@/services/charts/comparison'
import { copyCard, dashboardsFile, newCard, newDashboard } from '@/services/dashboards'
import { downloadJson, jsonFileName, pickFile } from '@/services/fileTransfer'
import { viewRowFilter } from '@/services/views'
import { useAnalysisStore } from '@/stores/analysis'
import { useLibraryStore } from '@/stores/library'
import { isRankedColumn } from '@/utils/columns'
import { readPreference, usePreference, writePreference } from '@/utils/preferences'

const route = useRoute()
const router = useRouter()
const analysis = useAnalysisStore()
const library = useLibraryStore()
library.load()

// --- The open dashboard --------------------------------------------------------------------------

const isId = (v) => typeof v === 'string' && v !== ''
const activeId = ref(
  isId(route.query.dashboard) ? route.query.dashboard : readPreference('dashboard', null, isId),
)
// The saved version of the open dashboard, and the working copy the tab shows and edits.
const savedDashboard = computed(
  () => library.dashboards.find((d) => d.id === activeId.value) ?? null,
)
const dashboard = ref(null)
const copyOf = (value) => JSON.parse(JSON.stringify(value))

/** Loads the saved dashboard into the working copy, dropping unsaved changes. */
function loadWorking() {
  dashboard.value = savedDashboard.value ? copyOf(savedDashboard.value) : null
}

// Once the dashboards are loaded, fall back to the first one when the remembered one is gone.
watch(
  [() => library.loaded, () => library.dashboards.length],
  () => {
    if (library.loaded && !savedDashboard.value) {
      activeId.value = library.dashboards[0]?.id ?? null
    }
  },
  { immediate: true },
)
// Another dashboard opened (or the saved ones just loaded): show it.
watch([activeId, () => library.loaded], loadWorking, { immediate: true })

const isDirty = computed(
  () =>
    !!dashboard.value &&
    !!savedDashboard.value &&
    JSON.stringify(dashboard.value) !== JSON.stringify(savedDashboard.value),
)

function confirmDiscard() {
  if (!isDirty.value) return true
  return confirm(`Discard unsaved changes to the dashboard "${savedDashboard.value.name}"?`)
}

/** Switches dashboards from the select, asking first when there are unsaved changes. */
function chooseDashboard(event) {
  const id = event.target.value
  if (id === activeId.value) return
  if (!confirmDiscard()) {
    event.target.value = activeId.value
    return
  }
  activeId.value = id
}

// Leaving the Analyse page would lose unsaved changes; switching to the Table tab keeps them (the
// tab stays alive).
const isAnalysePath = (path) => path === '/analyse' || path.startsWith('/analyse/')
const removeLeaveGuard = router.beforeEach((to, from) => {
  if (!isAnalysePath(from.path) || isAnalysePath(to.path)) return true
  return confirmDiscard()
})
onBeforeUnmount(removeLeaveGuard)

/** Puts the open dashboard in the URL, while the Charts tab is shown. */
function syncQuery() {
  const id = activeId.value
  if (route.name !== 'analyse-charts' || (route.query.dashboard ?? null) === id) return
  const query = { ...route.query }
  if (id) query.dashboard = id
  else delete query.dashboard
  router.replace({ query })
}

watch(activeId, (id) => {
  if (id) writePreference('dashboard', id)
  syncQuery()
})
onActivated(syncQuery)

// --- Dashboards ----------------------------------------------------------------------------------

/** Writes the working copy back to the saved dashboard. */
function saveDashboard() {
  const index = library.dashboards.findIndex((d) => d.id === activeId.value)
  if (index !== -1 && dashboard.value) library.dashboards[index] = copyOf(dashboard.value)
}

function revertDashboard() {
  if (confirmDiscard()) loadWorking()
}

// Autosave: changes to the open dashboard are saved as they are made. Remembered in this browser.
const autosave = usePreference('autosaveDashboards', false, (v) => typeof v === 'boolean')
watch(
  [dashboard, autosave],
  () => {
    if (autosave.value && isDirty.value) saveDashboard()
  },
  { deep: true },
)

// Name popup for a new dashboard, renaming the open one, or saving it as a new one.
const nameDialog = ref({ open: false, mode: 'new' })
const NAME_DIALOG = {
  new: { title: 'New dashboard', submit: 'Create' },
  rename: { title: 'Rename dashboard', submit: 'Rename' },
  saveAs: { title: 'Save as new dashboard', submit: 'Save' },
}

function openNameDialog(mode) {
  // A new dashboard replaces what the tab shows; unsaved changes would be lost.
  if (mode === 'new' && !confirmDiscard()) return
  nameDialog.value = { open: true, mode }
}

const nameDialogInitial = computed(() => {
  const name = savedDashboard.value?.name
  if (nameDialog.value.mode === 'rename') return name ?? ''
  if (nameDialog.value.mode === 'saveAs') return name ? `${name} copy` : 'New dashboard'
  return 'New dashboard'
})

function saveName(name) {
  const mode = nameDialog.value.mode
  if (mode === 'rename') {
    // Renaming saves only the name; other unsaved changes stay unsaved.
    const index = library.dashboards.findIndex((d) => d.id === activeId.value)
    if (index === -1) return
    library.dashboards[index] = { ...library.dashboards[index], name }
    dashboard.value.name = name
    return
  }
  // A new empty dashboard, or a copy of the working one; switching to it loads it, now saved.
  const created =
    mode === 'saveAs' && dashboard.value
      ? { ...copyOf(dashboard.value), id: crypto.randomUUID(), name }
      : newDashboard(name)
  library.dashboards.push(created)
  activeId.value = created.id
}

function deleteDashboard() {
  const current = savedDashboard.value
  if (!current || !confirm(`Delete the dashboard "${current.name}"? This cannot be undone.`)) return
  library.deleteDashboard(current.id)
  activeId.value = library.dashboards[0]?.id ?? null
}

// Short status message after importing dashboards, hidden again after a few seconds.
const message = ref('')
let messageTimer = null
watch(message, (text) => {
  clearTimeout(messageTimer)
  if (text) messageTimer = setTimeout(() => (message.value = ''), 6000)
})
onBeforeUnmount(() => clearTimeout(messageTimer))

/** Adds dashboards from a JSON file; one with the id of an existing dashboard replaces it. */
async function importDashboards() {
  const file = await pickFile()
  if (!file) return
  const wasDirty = isDirty.value
  try {
    const { added, replaced } = await library.importDashboards(file)
    message.value = `Imported ${added} new dashboard${added === 1 ? '' : 's'}${replaced ? `, updated ${replaced}` : ''}.`
    if (!savedDashboard.value) activeId.value = library.dashboards[0]?.id ?? null
    // An imported copy of the open dashboard replaces it; show it unless there are unsaved changes.
    else if (!wasDirty) loadWorking()
  } catch (error) {
    message.value = `Import failed: ${error.message}`
  }
}

/** Downloads the open dashboard as a JSON file, including unsaved changes. */
function exportDashboard() {
  const current = dashboard.value
  if (!current) return
  downloadJson(jsonFileName(current.name, 'dashboard'), dashboardsFile([current]))
}

// Shared filters: the dashboard's positions and conditions.
const filtersOpen = ref(false)
const filterCount = computed(() => {
  const d = dashboard.value
  if (!d) return 0
  return d.positions.length + d.filters.filter((f) => f.enabled !== false).length
})
const dashboardRowCount = computed(() => {
  const d = dashboard.value
  if (!d) return 0
  const positions = d.positions.filter((p) => analysis.columnInfo[p]?.type === 'boolean')
  return analysis.tableRows.filter(viewRowFilter({ positions, filters: d.filters })).length
})

// --- Cards ---------------------------------------------------------------------------------------

// The card in the editor, and the id of the card it replaces (null = a new card).
const editor = ref({ open: false, card: null, id: null })

function addCard() {
  const card = newCard('radar')
  // Start from the first custom metrics, like the table's chart panel.
  card.metrics = analysis.columns
    .filter((c) => analysis.columnInfo[c]?.metric && isRankedColumn(c, analysis.columnInfo[c]))
    .slice(0, RADAR_MAX_METRICS)
  editor.value = { open: true, card, id: null }
}

function editCard(card) {
  editor.value = { open: true, card, id: card.id }
}

function saveCard(edited) {
  const cards = dashboard.value.cards
  const index = cards.findIndex((c) => c.id === editor.value.id)
  if (index === -1) cards.push(edited)
  else cards[index] = edited
}

function duplicateCard(card) {
  const cards = dashboard.value.cards
  cards.splice(cards.indexOf(card) + 1, 0, copyCard(card))
}

/** Moves a card one place left (-1) or right (1). */
function moveCard(card, step) {
  const cards = dashboard.value.cards
  const from = cards.indexOf(card)
  const to = from + step
  if (to < 0 || to >= cards.length) return
  cards.splice(from, 1)
  cards.splice(to, 0, card)
}

/** Lists players selected on a scatter chart in the table (until its chip is cleared). */
function showInTable({ ids, label }) {
  analysis.chartSelection = { ids: new Set(ids), label }
  const query = { ...route.query }
  delete query.dashboard
  router.push({ name: 'analyse-table', query })
}

function removeCard(card) {
  const name = card.title || 'this card'
  if (!confirm(`Delete ${name}?`)) return
  dashboard.value.cards = dashboard.value.cards.filter((c) => c !== card)
}
</script>

<template>
  <div class="toolbar">
    <div class="stick-left">
      <DatasetControls />
    </div>
    <div class="stick-right">
      <template v-if="library.dashboards.length">
        <label>
          Dashboard
          <select :value="activeId" @change="chooseDashboard">
            <option v-for="d in library.dashboards" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </label>
        <button
          type="button"
          class="short filters-button"
          :class="{ active: filterCount }"
          title="Positions and conditions for every card"
          :disabled="!dashboard"
          @click="filtersOpen = true"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3h12l-4.5 5.5V13l-3-1.5v-3z" />
          </svg>
          Filters<span v-if="filterCount" class="count">{{ filterCount }}</span>
        </button>
      </template>
      <ActionMenu label="Dashboard actions">
        <button type="button" class="menu-item" role="menuitem" @click="openNameDialog('new')">
          New dashboard...
        </button>
        <button
          type="button"
          class="menu-item"
          role="menuitem"
          :disabled="!dashboard"
          @click="openNameDialog('rename')"
        >
          Rename dashboard...
        </button>
        <hr />
        <button
          type="button"
          class="menu-item"
          role="menuitem"
          :disabled="!isDirty"
          :title="dashboard ? `Save changes to &quot;${dashboard.name}&quot;` : undefined"
          @click="saveDashboard"
        >
          Save dashboard
        </button>
        <button
          type="button"
          class="menu-item"
          role="menuitem"
          :disabled="!dashboard"
          @click="openNameDialog('saveAs')"
        >
          Save dashboard as...
        </button>
        <button
          type="button"
          class="menu-item"
          role="menuitemcheckbox"
          :aria-checked="autosave"
          title="Save changes to the open dashboard as they are made"
          @click="autosave = !autosave"
        >
          <span class="check" :class="{ on: autosave }" aria-hidden="true"></span>
          Autosave dashboard
        </button>
        <button
          type="button"
          class="menu-item"
          role="menuitem"
          :disabled="!isDirty"
          title="Undo all changes since the last save"
          @click="revertDashboard"
        >
          Revert dashboard
        </button>
        <hr />
        <button
          type="button"
          class="menu-item"
          role="menuitem"
          title="Add dashboards from a JSON file"
          @click="importDashboards"
        >
          Import dashboard(s)
        </button>
        <button
          type="button"
          class="menu-item"
          role="menuitem"
          :disabled="!dashboard"
          title="Download this dashboard as a JSON file, including unsaved changes"
          @click="exportDashboard"
        >
          Export current dashboard
        </button>
        <button
          type="button"
          class="menu-item"
          role="menuitem"
          :disabled="!library.dashboards.length"
          title="Download all dashboards as a JSON file"
          @click="library.exportDashboards"
        >
          Export all dashboards
        </button>
        <hr />
        <button
          type="button"
          class="menu-item danger"
          role="menuitem"
          :disabled="!dashboard"
          @click="deleteDashboard"
        >
          Delete dashboard
        </button>
      </ActionMenu>
      <span v-if="isDirty" class="unsaved" title="Unsaved changes">●</span>
    </div>
  </div>

  <p v-if="message" class="message">{{ message }}</p>

  <p v-if="analysis.isLoading">Loading...</p>

  <div v-else-if="!dashboard" class="empty">
    <p>
      A dashboard shows several charts of the same players side by side: radars, butterfly and
      scatter charts, each with its own metrics, positions and player.
    </p>
    <div class="empty-actions">
      <button type="button" class="short primary" @click="openNameDialog('new')">
        New dashboard...
      </button>
      <button type="button" class="short" @click="importDashboards">Import dashboard(s)...</button>
    </div>
  </div>

  <template v-else>
    <div class="summary-bar">
      <p class="summary">
        {{ dashboardRowCount }} of {{ analysis.tableRows.length }} players match the dashboard's
        filters.
      </p>
      <button v-if="dashboard.cards.length" type="button" class="short" @click="addCard">
        + Add card
      </button>
    </div>
    <div v-if="dashboard.cards.length" class="cards">
      <DashboardCard
        v-for="(card, i) in dashboard.cards"
        :key="card.id"
        :dashboard="dashboard"
        :card="card"
        :is-first="i === 0"
        :is-last="i === dashboard.cards.length - 1"
        :rows="analysis.tableRows"
        :columns="analysis.columns"
        :column-info="analysis.columnInfo"
        :players="analysis.players"
        @edit="editCard(card)"
        @duplicate="duplicateCard(card)"
        @remove="removeCard(card)"
        :shortlist-ids="analysis.shortlistIds"
        @player="(player) => (card.player = player)"
        @show-in-table="showInTable"
        @move="(step) => moveCard(card, step)"
      />
    </div>
    <div v-else class="empty">
      <p>This dashboard has no cards yet.</p>
      <button type="button" class="short primary" @click="addCard">+ Add card</button>
    </div>

    <ViewFiltersDialog
      v-model:open="filtersOpen"
      v-model:positions="dashboard.positions"
      v-model:filters="dashboard.filters"
      :columns="analysis.columns"
      :column-info="analysis.columnInfo"
      :match-count="dashboardRowCount"
      :total-count="analysis.tableRows.length"
    />
    <CardEditorDialog
      v-model:open="editor.open"
      :card="editor.card"
      :is-new="editor.id == null"
      :dashboard-positions="dashboard.positions"
      :columns="analysis.columns"
      :column-info="analysis.columnInfo"
      @save="saveCard"
    />
  </template>

  <SaveViewDialog
    v-model:open="nameDialog.open"
    :title="NAME_DIALOG[nameDialog.mode].title"
    :submit-label="NAME_DIALOG[nameDialog.mode].submit"
    duplicate-message="Another dashboard already has this name."
    :existing-names="
      library.dashboards
        .filter((d) => nameDialog.mode !== 'rename' || d !== savedDashboard)
        .map((d) => d.name)
    "
    :initial-name="nameDialogInitial"
    @save="saveName"
  />
</template>

<style lang="scss" scoped>
@use 'sass:color';

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;

  // Like the Table tab's toolbar (controls stretch to the row's height).
  .stick-left,
  .stick-right {
    display: flex;
    gap: 0.35rem;
  }

  .stick-right {
    margin-left: auto;
  }
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

// Checkbox of the Autosave menu item (like the Table tab's).
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
  align-self: center;
  color: #f2c94c;
  font-size: 0.7rem;
}

.message {
  margin: 0 0 0.75rem;
  opacity: 0.85;
}

.empty-actions {
  display: flex;
  gap: 0.5rem;
}

.summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}

.summary {
  margin: 0;
  opacity: 0.8;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1rem;
}

.empty {
  max-width: 40rem;

  p {
    opacity: 0.8;
  }
}
</style>
