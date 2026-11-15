<script setup>
import { computed, markRaw, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  customColumnErrors,
  mergeSources,
  readSourceFile,
  sourceColumns,
  sourceSummaries,
  unitErrors,
} from '@/services/advancedImport'
import { ID_COLUMN, saveDataset } from '@/services/csvImport'

const router = useRouter()

const name = ref('')
const sources = ref([])
const customColumns = ref([])
const fileInput = ref(null)
const isReading = ref(false)
const readError = ref('')

// New custom column form.
const newColumnName = ref('')
const newColumnType = ref('text')

const isImporting = ref(false)
const progress = ref(0)
const statusMessage = ref('')
const importError = ref('')

let nextId = 1

const csvColumns = computed(() => sourceColumns(sources.value))
const pickableColumns = computed(() => csvColumns.value.filter((c) => c !== ID_COLUMN))
const summaries = computed(() => sourceSummaries(sources.value.filter((s) => !s.error)))

/** Summary of a file, or null when the file has an error. */
function summaryOf(source) {
  const valid = sources.value.filter((s) => !s.error)
  const index = valid.indexOf(source)
  return index === -1 ? null : summaries.value[index]
}

function isExisting(column) {
  return csvColumns.value.includes(column.name)
}

const validSources = computed(() => sources.value.filter((s) => !s.error))
const fileErrors = computed(() => sources.value.map((s) => s.error).filter(Boolean))
const unitProblems = computed(() => unitErrors(validSources.value))
const columnProblems = computed(() => customColumnErrors(validSources.value, customColumns.value))
const errors = computed(() => [...fileErrors.value, ...unitProblems.value, ...columnProblems.value])
const canImport = computed(
  () =>
    !isImporting.value &&
    !isReading.value &&
    sources.value.length > 0 &&
    name.value.trim() !== '' &&
    !errors.value.length,
)

async function addFiles(evt) {
  const files = [...evt.target.files]
  evt.target.value = ''
  if (!files.length) return
  isReading.value = true
  readError.value = ''
  try {
    for (const file of files) {
      const source = await readSourceFile(file)
      // Rows aren't edited here; keeping them out of Vue's reactivity keeps large files fast.
      source.rows = markRaw(source.rows)
      source.fields = markRaw(source.fields)
      source.id = nextId++
      // A new file gets every custom column, with an empty value.
      for (const column of customColumns.value) source.values[column.id] = ''
      sources.value.push(source)
    }
    if (!name.value.trim() && sources.value.length) {
      name.value = sources.value[0].fileName.replace(/\.csv$/i, '')
    }
  } catch (error) {
    readError.value = `Reading the file failed: ${error.message}`
  } finally {
    isReading.value = false
  }
}

function moveSource(index, offset) {
  const list = sources.value
  const [source] = list.splice(index, 1)
  list.splice(index + offset, 0, source)
}

function removeSource(index) {
  sources.value.splice(index, 1)
}

function addColumn() {
  const columnName = newColumnName.value.trim()
  if (!columnName) return
  const column = { id: nextId++, name: columnName, type: newColumnType.value }
  customColumns.value.push(column)
  for (const source of sources.value) source.values[column.id] = ''
  newColumnName.value = ''
  newColumnType.value = 'text'
}

function removeColumn(index) {
  const [column] = customColumns.value.splice(index, 1)
  for (const source of sources.value) delete source.values[column.id]
}

function columnLabel(column) {
  if (isExisting(column)) return 'existing column'
  return column.type === 'number' ? 'new number column' : 'new text column'
}

async function runImport() {
  if (!canImport.value) return
  isImporting.value = true
  importError.value = ''
  progress.value = 0
  statusMessage.value = 'Merging files...'
  try {
    // Let the status render before the (synchronous) merge.
    await new Promise((resolve) => setTimeout(resolve))
    const list = validSources.value
    const dataset = mergeSources(list, customColumns.value)
    const { importId } = await saveDataset(
      name.value.trim(),
      dataset,
      (percent, message) => {
        progress.value = percent
        statusMessage.value = message
      },
      { sources: list.map((s) => ({ fileName: s.fileName, rowCount: s.rows.length })) },
    )
    router.push({ path: '/analyse', query: { import: importId } })
  } catch (error) {
    importError.value = `Import failed: ${error.message}`
    statusMessage.value = ''
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <div class="import-page">
    <h1>Advanced import</h1>

    <details class="info">
      <summary>How it works</summary>
      <ul>
        <li>
          Load several CSV exports from the same save, e.g. one view exported with different
          filters. They are merged into a single dataset.
        </li>
        <li>
          Every file needs a <code>{{ ID_COLUMN }}</code> column; players are matched on it. A file
          can't contain the same player twice.
        </li>
        <li>
          The first file is the <strong>main file</strong>. Each file below overrides the values of
          the files above it, empty cells included. Columns a file doesn't have are left alone.
        </li>
        <li>
          Other files only change players of the files above them, unless
          <em>Add players not in the main file</em> is checked. Added players get N/A in the columns
          their file doesn't have.
        </li>
        <li>
          <strong>Custom columns</strong> are a new column (text or number) or one of the CSV
          columns, set to one value for all players of a file. The main file's value is the default
          for every player; another file's value is set for its own players. Remove a value from a
          file to leave that column unchanged for it. An empty value is saved as empty.
        </li>
        <li>
          Values in a CSV column must use the column's format (e.g. <code>€1.5M</code>). Columns
          with different units or currencies in different files can't be merged.
        </li>
        <li>After the import the dataset works like any other: notes and shortlist included.</li>
      </ul>
    </details>

    <section class="block">
      <label class="field">
        Dataset name
        <input v-model="name" type="text" placeholder="e.g. Scouting 2027-01" />
      </label>
    </section>

    <section class="block">
      <h2>Custom columns</h2>
      <form class="add-column" @submit.prevent="addColumn">
        <input
          v-model="newColumnName"
          type="text"
          list="csv-columns"
          placeholder="New name or a CSV column"
        />
        <datalist id="csv-columns">
          <option v-for="col in pickableColumns" :key="col" :value="col" />
        </datalist>
        <select
          v-if="!csvColumns.includes(newColumnName.trim())"
          v-model="newColumnType"
          aria-label="Type of the new column"
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
        <span v-else class="hint">existing column</span>
        <button type="submit" class="short" :disabled="!newColumnName.trim()">Add column</button>
      </form>
      <ul v-if="customColumns.length" class="columns">
        <li v-for="(column, index) in customColumns" :key="column.id">
          <strong>{{ column.name }}</strong>
          <span class="hint">{{ columnLabel(column) }}</span>
          <button
            type="button"
            class="short"
            :title="`Remove the ${column.name} column`"
            @click="removeColumn(index)"
          >
            Remove
          </button>
        </li>
      </ul>
      <p v-else class="hint">No custom columns. The files are merged as they are.</p>
    </section>

    <section class="block">
      <h2>Files</h2>
      <input ref="fileInput" type="file" accept=".csv" multiple hidden @change="addFiles" />

      <ol v-if="sources.length" class="sources">
        <li
          v-for="(source, index) in sources"
          :key="source.id"
          class="source"
          :class="{ invalid: source.error }"
        >
          <div class="source-head">
            <span class="role">{{ index === 0 ? 'Main file' : `Override ${index}` }}</span>
            <strong class="file-name">{{ source.fileName }}</strong>
            <span class="actions">
              <button
                type="button"
                class="short"
                :disabled="index === 0"
                title="Move up"
                @click="moveSource(index, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="short"
                :disabled="index === sources.length - 1"
                title="Move down"
                @click="moveSource(index, 1)"
              >
                ↓
              </button>
              <button type="button" class="short" @click="removeSource(index)">Remove</button>
            </span>
          </div>

          <p v-if="source.error" class="error">{{ source.error }}</p>
          <template v-else-if="summaryOf(source)">
            <p class="summary">
              <template v-if="index === 0">{{ summaryOf(source).rows }} players.</template>
              <template v-else>
                {{ summaryOf(source).rows }} rows: {{ summaryOf(source).matched }} matched,
                <template v-if="source.addNew">{{ summaryOf(source).added }} new.</template>
                <template v-else
                  >{{ summaryOf(source).skipped }} not in the files above (skipped).</template
                >
              </template>
            </p>
            <p
              v-if="
                index > 0 &&
                source.addNew &&
                summaryOf(source).added &&
                summaryOf(source).missingColumns.length
              "
              class="warning"
              :title="summaryOf(source).missingColumns.join(', ')"
            >
              This file lacks {{ summaryOf(source).missingColumns.length }} of the main file's
              columns; the {{ summaryOf(source).added }} new players will have N/A there.
            </p>
            <label v-if="index > 0" class="check">
              <input v-model="source.addNew" type="checkbox" />
              Add players not in the main file
            </label>
          </template>

          <div v-if="customColumns.length && !source.error" class="values">
            <span class="values-title">
              {{ index === 0 ? 'Default values' : 'Override values' }}
            </span>
            <div v-for="column in customColumns" :key="column.id" class="value-row">
              <span class="value-name">{{ column.name }}</span>
              <template v-if="column.id in source.values">
                <input
                  v-model="source.values[column.id]"
                  type="text"
                  :inputmode="!isExisting(column) && column.type === 'number' ? 'decimal' : 'text'"
                  placeholder="(empty)"
                  :aria-label="`${column.name} for ${source.fileName}`"
                />
                <button
                  type="button"
                  class="short"
                  :title="
                    index === 0
                      ? 'No default value'
                      : `Don't change ${column.name} for this file's players`
                  "
                  @click="delete source.values[column.id]"
                >
                  ✕
                </button>
              </template>
              <template v-else>
                <span class="hint">
                  {{
                    index === 0 ? (isExisting(column) ? 'CSV values kept' : 'empty') : 'not changed'
                  }}
                </span>
                <button type="button" class="short" @click="source.values[column.id] = ''">
                  Set value
                </button>
              </template>
            </div>
          </div>
        </li>
      </ol>

      <div class="add-files">
        <button type="button" class="short" :disabled="isReading" @click="fileInput.click()">
          {{ sources.length ? 'Add more CSV files...' : 'Add CSV files...' }}
        </button>
        <span v-if="isReading" class="hint">Reading...</span>
        <span v-if="readError" class="error">{{ readError }}</span>
      </div>
    </section>

    <section class="block">
      <ul v-if="errors.length" class="errors">
        <li v-for="error in errors" :key="error" class="error">{{ error }}</li>
      </ul>
      <div class="import-actions">
        <button type="button" class="short primary" :disabled="!canImport" @click="runImport">
          Import
        </button>
        <RouterLink to="/analyse">Cancel</RouterLink>
        <progress v-if="isImporting" :value="progress" max="100"></progress>
        <span v-if="statusMessage" class="hint">{{ statusMessage }}</span>
        <span v-if="importError" class="error">{{ importError }}</span>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.import-page {
  max-width: 56rem;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
  font-weight: 500;
}

.block {
  margin-bottom: 1.5rem;
}

.info {
  margin-bottom: 1.5rem;
  padding: 0.5rem 1rem;
  background: $card-background;
  border: 1px solid $card-border;
  border-radius: 5px;

  summary {
    cursor: pointer;
    font-weight: 500;
  }

  ul {
    margin: 0.5rem 0;
    padding-left: 1.2rem;
  }

  li + li {
    margin-top: 0.35rem;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-width: 24rem;
}

.hint {
  font-size: 0.85rem;
  opacity: 0.7;
}

.error {
  color: #ff8a8a;
}

.warning {
  color: #f0c36b;
}

.add-column {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;

  input {
    flex: 1 1 14rem;
    max-width: 22rem;
  }
}

.columns {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem 0;
  }
}

.sources {
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.source {
  padding: 0.75rem 1rem;
  background: $card-background;
  border: 1px solid $card-border;
  border-radius: 5px;

  &.invalid {
    border-color: #a33;
  }

  p {
    margin: 0.4rem 0 0;
  }
}

.source-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.role {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: $accent-color;
}

.file-name {
  overflow-wrap: anywhere;
}

.actions {
  margin-left: auto;
  display: flex;
  gap: 0.4rem;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.values {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid $card-border;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.values-title {
  font-size: 0.85rem;
  opacity: 0.7;
}

.value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;

  input {
    flex: 1 1 10rem;
    max-width: 20rem;
  }
}

.value-name {
  min-width: 10rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.add-files,
.import-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.errors {
  margin: 0 0 0.75rem;
  padding-left: 1.2rem;
}

progress {
  width: 8rem;
}
</style>
