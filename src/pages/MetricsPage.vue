<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch, watchEffect } from 'vue'

import BlockPalette from '@/components/formula/BlockPalette.vue'
import ColumnOptions from '@/components/formula/ColumnOptions.vue'
import FormulaSlot from '@/components/formula/FormulaSlot.vue'
import GroupTree from '@/components/GroupTree.vue'
import { provideFormulaEditor } from '@/components/formula/editorContext'
import { useDataset } from '@/composables/useDataset'
import { useRememberedSelection } from '@/composables/useRememberedSelection'
import { toText } from '@/services/expression'
import { downloadJson, jsonFileName, pickFile } from '@/services/fileTransfer'
import { computeMetrics, metricsFile, newMetric } from '@/services/metrics'
import { NA } from '@/services/transform'
import { useLibraryStore } from '@/stores/library'
import { columnLabel } from '@/utils/columns'

const PREVIEW_ROWS = 10
const ROOT = ['expression']

const library = useLibraryStore()
library.load()
const drafts = library.metricDrafts
const groups = library.metricGroups

const { imports, selectedId: datasetId, columns, columnInfo, rows } = useDataset()

// The metric open in the editor: from the URL, else the one last edited here.
const selectedMetricId = useRememberedSelection({
  preferenceKey: 'editedMetric',
  queryKey: 'metric',
  ids: () => drafts.items.map((m) => m.id),
  ready: () => library.loaded,
})
const message = ref('')

// The editor changes a draft copy of the selected metric; nothing is stored until Save.
const metric = computed(() => drafts.byId[selectedMetricId.value] ?? null)
const isNew = computed(() => !!metric.value && drafts.isNew(metric.value.id))
const isDirty = computed(() => !!metric.value && drafts.isDirty(metric.value.id))

watch(selectedMetricId, (_, previous) => previous && drafts.release(previous))
watchEffect(() => selectedMetricId.value && drafts.edit(selectedMetricId.value))

// Metrics as they would be after saving every draft.
const workingMetrics = computed(() => drafts.working)

const metricNames = computed(() => workingMetrics.value.map((m) => m.name).filter(Boolean))
const columnOptions = computed(() => [...metricNames.value, ...columns.value])
const knownColumns = computed(() => new Set(columnOptions.value))

const editor = provideFormulaEditor(metric, {
  knownColumns,
  distinctValues(column) {
    const values = new Set()
    for (const row of rows.value) {
      const v = row[column]
      if (v != null && v !== '' && typeof v !== 'object') values.add(String(v))
    }
    return [...values].sort((a, b) => a.localeCompare(b))
  },
})

// Results are recomputed shortly after edits stop, so typing stays responsive.
const preview = shallowRef(null)
let timer = null
watch(
  [workingMetrics, rows, columns],
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      preview.value = rows.value.length
        ? computeMetrics(rows.value, workingMetrics.value, columns.value)
        : null
    }, 250)
  },
  { deep: true, immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

const problems = computed(() => (metric.value && preview.value?.problems[metric.value.id]) ?? [])
const range = computed(() => metric.value && preview.value?.stats[metric.value.name])

const topRows = computed(() => {
  if (!metric.value || !preview.value) return []
  const name = metric.value.name
  return preview.value.rows
    .filter((r) => typeof r[name] === 'number')
    .sort((a, b) => b[name] - a[name])
    .slice(0, PREVIEW_ROWS)
})

const missingCount = computed(() => {
  if (!metric.value || !preview.value) return 0
  return preview.value.rows.filter((r) => r[metric.value.name] === NA).length
})

const formulaText = computed(() =>
  metric.value ? toText(metric.value.expression, (c) => columnLabel(c)) : '',
)

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 })

function metricStatus(m) {
  return {
    state: drafts.isNew(m.id) ? 'new' : drafts.isDirty(m.id) ? 'dirty' : null,
    invalid: !!preview.value?.problems[m.id],
  }
}

/** Adds a metric to a group; by default the group of the selected metric. */
function addMetric(groupId = metric.value ? groups.parentOf(metric.value) : null) {
  const metricItem = newMetric(uniqueName('New metric'))
  metricItem.groupId = groupId
  drafts.add(metricItem)
  selectedMetricId.value = metricItem.id
  editor.select(ROOT)
}

function duplicateMetric() {
  if (!metric.value) return
  const copy = JSON.parse(JSON.stringify(metric.value))
  copy.id = crypto.randomUUID()
  copy.name = uniqueName(`${metric.value.name} copy`)
  drafts.add(copy)
  selectedMetricId.value = copy.id
}

function saveMetric() {
  if (!metric.value) return
  drafts.save(metric.value.id)
  message.value = `Saved "${metric.value.name}".`
}

function revertMetric() {
  if (metric.value) drafts.revert(metric.value.id)
}

// Exports the version shown in the editor, including unsaved changes.
function exportMetric() {
  downloadJson(jsonFileName(metric.value.name, 'metric'), metricsFile([metric.value]))
}

function deleteMetric() {
  if (!metric.value) return
  if (!confirm(`Delete the metric "${metric.value.name}"?`)) return
  // Select the neighbouring item rather than jumping back to the top of the list.
  const index = drafts.items.findIndex((item) => item.id === metric.value.id)
  drafts.remove(metric.value.id)
  selectedMetricId.value = drafts.items[Math.min(index, drafts.items.length - 1)]?.id ?? null
}

// Order is part of the saved list, so moving takes effect immediately (saved metrics only).
// Metrics move past the others in the same group.
function moveMetric(delta) {
  if (metric.value) groups.moveItemBy(metric.value.id, delta)
}

function clearAll() {
  const count = drafts.items.length
  const groupCount = groups.list.length
  const parts = [`${count} metric${count === 1 ? '' : 's'}`]
  if (groupCount) parts.push(`${groupCount} group${groupCount === 1 ? '' : 's'}`)
  if (!confirm(`Delete all ${parts.join(' and ')}? This cannot be undone.`)) return
  groups.clear()
  message.value = 'Deleted all metrics.'
}

function uniqueName(base) {
  const names = new Set(metricNames.value)
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

function insertBlock(blockId) {
  if (!metric.value) return
  editor.insert(editor.selectedPath.value ?? ROOT, blockId)
}

async function importFile() {
  const file = await pickFile()
  if (!file) return
  try {
    const { added, replaced } = await library.importMetrics(file)
    message.value = `Imported ${added} new metric${added === 1 ? '' : 's'}${replaced ? `, updated ${replaced}` : ''}.`
  } catch (error) {
    message.value = `Import failed: ${error.message}`
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <div class="page-header">
    <h1>Metrics</h1>
    <div class="actions">
      <button type="button" @click="addMetric()">New metric</button>
      <button type="button" @click="importFile">Import JSON</button>
      <button type="button" :disabled="!library.metrics.length" @click="library.exportMetrics">
        Export all
      </button>
      <button
        type="button"
        class="danger"
        :disabled="!drafts.items.length && !groups.list.length"
        @click="clearAll"
      >
        Clear all
      </button>
    </div>
  </div>
  <p v-if="message" class="message">{{ message }}</p>

  <ColumnOptions :columns="columnOptions" :column-info="columnInfo" />

  <div class="layout">
    <GroupTree
      :groups="groups"
      :items="workingMetrics"
      :selected-id="selectedMetricId"
      :status="metricStatus"
      noun="metric"
      noun-plural="metrics"
      @select="selectedMetricId = $event"
      @add-item="addMetric"
    />

    <section v-if="metric" class="editor" @click="editor.select(null)">
      <div class="toolbar">
        <div class="item-actions">
          <button type="button" class="primary" :disabled="!isDirty" @click="saveMetric">
            Save
          </button>
          <button
            v-if="!isNew"
            type="button"
            :disabled="!isDirty"
            title="Undo all changes since the last save"
            @click="revertMetric"
          >
            Revert
          </button>
          <button type="button" title="Move up" :disabled="isNew" @click="moveMetric(-1)">↑</button>
          <button type="button" title="Move down" :disabled="isNew" @click="moveMetric(1)">
            ↓
          </button>
          <button type="button" @click="duplicateMetric">Duplicate</button>
          <button type="button" title="Download this metric as a JSON file" @click="exportMetric">
            Export JSON
          </button>
          <button type="button" class="danger" @click="deleteMetric">Delete</button>
        </div>
        <p v-if="isDirty" class="unsaved">
          {{ isNew ? 'Not saved yet' : 'Unsaved changes' }} — the table uses the saved version.
        </p>
      </div>
      <div class="form" @click.stop>
        <div class="row">
          <label class="field name">
            Name
            <input v-model.trim="metric.name" type="text" />
          </label>
          <label class="field group-field">
            Group
            <select
              :value="groups.parentOf(metric) ?? ''"
              @change="groups.moveItem(metric.id, $event.target.value || null)"
            >
              <option value="">(top level)</option>
              <option v-for="g in groups.options" :key="g.id" :value="g.id">{{ g.path }}</option>
            </select>
          </label>
        </div>
        <div class="row">
          <textarea v-model="metric.description" placeholder="Description"></textarea>
        </div>
        <div class="options">
          <label
            ><input v-model="metric.onlyIfPlayed" type="checkbox" /> Players with no minutes get
            0</label
          >
          <label><input v-model="metric.normalize" type="checkbox" /> Scale to 0–100</label>
          <label
            ><input v-model="metric.colorScale" type="checkbox" /> Colour cells red → green</label
          >
          <label>
            Decimals
            <select v-model="metric.decimals">
              <option :value="null">no rounding</option>
              <option v-for="d in [0, 1, 2, 3]" :key="d" :value="d">{{ d }}</option>
            </select>
          </label>
        </div>
      </div>

      <h3>Formula</h3>
      <div class="canvas" @click.stop="editor.select(null)">
        <FormulaSlot :path="ROOT" placeholder="drag a block here to start" />
      </div>
      <p class="formula-text"><span>=</span> {{ formulaText }}</p>

      <ul v-if="problems.length" class="problems">
        <li v-for="p in problems" :key="p">{{ p }}</li>
      </ul>

      <h3>Preview</h3>
      <p v-if="!imports.length" class="hint">Load a CSV file to preview results.</p>
      <template v-else>
        <label class="field inline">
          Dataset
          <select v-model="datasetId">
            <option v-for="imp in imports" :key="imp.id" :value="imp.id">
              {{ imp.fileName }} — {{ formatDate(imp.importedAt) }}
            </option>
          </select>
        </label>
        <p v-if="range" class="hint">
          Range {{ numberFormat.format(range.min) }} – {{ numberFormat.format(range.max) }}
          <span v-if="missingCount"> · {{ missingCount }} players without a value</span>
        </p>
        <table v-if="topRows.length" class="preview">
          <thead>
            <tr>
              <th>Player</th>
              <th>Club</th>
              <th>Position</th>
              <th class="numeric">{{ metric.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in topRows" :key="i">
              <td>{{ row.Player }}</td>
              <td>{{ row.Club }}</td>
              <td>{{ row.Position }}</td>
              <td class="numeric">{{ numberFormat.format(row[metric.name]) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <BlockPalette v-if="metric" @insert="insertBlock" />
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;

  h1 {
    margin: 0;
  }
}

.actions,
.item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid color.adjust($background-color, $lightness: 10%);
}

.unsaved {
  margin: 0;
  color: #f2c94c;
  font-size: 0.85rem;
}

.message {
  margin: 0 0 1rem;
  opacity: 0.85;
}

.layout {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr) 17rem;
  align-items: start;
  gap: 1rem;

  @media (max-width: $sidebar-breakpoint) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.editor {
  min-width: 0;
  padding: 1rem;
  background: color.adjust($background-color, $lightness: 2%);
  border: 1px solid color.adjust($background-color, $lightness: 10%);
  border-radius: 6px;

  h3 {
    margin: 1.25rem 0 0.5rem;
  }
}

.form {
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
}

.field {
  font-size: 0.85rem;

  &.name input {
    min-width: 50%;
    font-size: 1rem;
    font-weight: 500;
    display: block;
  }

  &.inline {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1rem;
}

.field.name {
  flex: 1;

  input {
    width: 100%;
  }
}

.group-field select {
  display: block;
  max-width: 20rem;
}

.row textarea {
  width: 100%;
  font-size: 0.85rem;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  font-size: 0.85rem;

  label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  select {
    padding: 0.15rem 0.3rem;
  }
}

.canvas {
  min-height: 4rem;
  padding: 1rem;
  overflow-x: auto;
  background: color.adjust($background-color, $lightness: -2%);
  border: 1px solid color.adjust($background-color, $lightness: 10%);
  border-radius: 6px;
}

.formula-text {
  margin: 0.5rem 0 0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.8rem;
  opacity: 0.75;
  overflow-wrap: anywhere;

  span {
    opacity: 0.6;
  }
}

.problems {
  margin: 0.75rem 0 0;
  padding: 0.5rem 0.75rem 0.5rem 1.75rem;
  color: #f2c94c;
  font-size: 0.85rem;
  background: rgba(242, 201, 76, 0.08);
  border-radius: 5px;
}

.hint {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

.preview {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  border-collapse: collapse;

  th,
  td {
    padding: 0.2rem 0.75rem 0.2rem 0;
    text-align: left;
    border-bottom: 1px solid color.adjust($background-color, $lightness: 6%);
  }

  .numeric {
    text-align: center;
  }
}
</style>
