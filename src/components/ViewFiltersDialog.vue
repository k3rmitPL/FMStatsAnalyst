<script setup>
// Popup for the row filters of the table's view: positions on a pitch, column conditions and the
// default sort. Changes apply to the table right away; saving them is up to the page.

import { computed, ref, watch } from 'vue'

import ColumnInput from '@/components/formula/ColumnInput.vue'
import ColumnOptions from '@/components/formula/ColumnOptions.vue'
import { FILTER_COMPARISONS } from '@/services/views'

// Positions laid out like a pitch, attack at the top.
const PITCH = [
  ['STL', 'STC', 'STR'],
  ['AML', 'AMC', 'AMR'],
  ['ML', 'MC', 'MR'],
  ['WBL', 'DM', 'WBR'],
  ['DL', 'DC', 'DR'],
  [null, 'GK', null],
]

const props = defineProps({
  // Column names the filters can use, and their info (for labels).
  columns: { type: Array, required: true },
  columnInfo: { type: Object, default: () => ({}) },
  // Players matching the filters, and players in the dataset.
  matchCount: { type: Number, default: null },
  totalCount: { type: Number, default: null },
})

const open = defineModel('open', { type: Boolean, default: false })
const positions = defineModel('positions', { type: Array, required: true })
const filters = defineModel('filters', { type: Array, required: true })
// { column, direction: 'asc' | 'desc' } | null
const sort = defineModel('sort', { type: Object, default: null })

const dialog = ref(null)
const known = computed(() => new Set(props.columns))

watch(open, (isOpen) => {
  if (isOpen && !dialog.value.open) dialog.value.showModal()
  else if (!isOpen && dialog.value.open) dialog.value.close()
})

// Clicks on the backdrop land on the <dialog> element itself.
function onDialogClick(event) {
  if (event.target === dialog.value) open.value = false
}

// Positions the dataset has a true/false column for (split from its Position column on import).
const availablePositions = computed(
  () => new Set(PITCH.flat().filter((pos) => pos && props.columnInfo[pos]?.type === 'boolean')),
)

function togglePosition(position) {
  if (!availablePositions.value.has(position)) return
  positions.value = positions.value.includes(position)
    ? positions.value.filter((p) => p !== position)
    : [...positions.value, position]
}

function updateFilter(index, changes) {
  filters.value = filters.value.map((f, i) => (i === index ? { ...f, ...changes } : f))
}

function addFilter() {
  filters.value = [...filters.value, { column: 'Minutes', cmp: '>=', value: 600 }]
}

function removeFilter(index) {
  filters.value = filters.value.filter((_, i) => i !== index)
}

const sortColumn = computed({
  get: () => sort.value?.column ?? '',
  set: (column) => {
    sort.value = column ? { column, direction: sort.value?.direction ?? 'desc' } : null
  },
})

function setSortDirection(direction) {
  if (sort.value) sort.value = { ...sort.value, direction }
}

function clearAll() {
  positions.value = []
  filters.value = []
}
</script>

<template>
  <dialog ref="dialog" class="filters-dialog" @close="open = false" @click="onDialogClick">
    <div class="dialog-body">
      <header>
        <h2>Filters</h2>
        <button type="button" class="close" title="Close" aria-label="Close" @click="open = false">
          ×
        </button>
      </header>

      <ColumnOptions id="filter-column-options" :columns="columns" :column-info="columnInfo" />

      <div class="sections">
        <section>
          <h3>Positions</h3>
          <p class="hint">Players who can play any selected position. None selected = everyone.</p>
          <p v-if="!availablePositions.size" class="hint unavailable">
            This dataset has no Position column, so players can't be filtered by position.
          </p>
          <p v-else-if="availablePositions.size < 16" class="hint unavailable">
            Greyed-out positions are not in this dataset.
          </p>
          <div class="pitch" :class="{ disabled: !availablePositions.size }">
            <template v-for="(line, r) in PITCH" :key="r">
              <template v-for="(pos, c) in line" :key="`${r}-${c}`">
                <button
                  v-if="pos"
                  type="button"
                  class="position"
                  :class="{ active: positions.includes(pos) }"
                  :aria-pressed="positions.includes(pos)"
                  :disabled="!availablePositions.has(pos)"
                  :title="availablePositions.has(pos) ? '' : 'Not in this dataset'"
                  @click="togglePosition(pos)"
                >
                  {{ pos }}
                </button>
                <span v-else></span>
              </template>
            </template>
          </div>
        </section>

        <section class="conditions">
          <h3>Conditions</h3>
          <p class="hint">All conditions must match.</p>
          <div v-for="(filter, i) in filters" :key="i" class="filter">
            <ColumnInput
              :model-value="filter.column"
              list="filter-column-options"
              :known="known"
              @update:model-value="updateFilter(i, { column: $event })"
            />
            <select :value="filter.cmp" @change="updateFilter(i, { cmp: $event.target.value })">
              <option v-for="(def, key) in FILTER_COMPARISONS" :key="key" :value="key">
                {{ def.label }}
              </option>
            </select>
            <input
              :value="filter.value"
              type="text"
              class="value"
              aria-label="Value"
              @input="updateFilter(i, { value: $event.target.value })"
            />
            <button type="button" class="mini" title="Remove condition" @click="removeFilter(i)">
              ×
            </button>
          </div>
          <button type="button" class="mini add" @click="addFilter">+ Add condition</button>

          <h3>Default sort</h3>
          <div class="filter">
            <ColumnInput
              v-model="sortColumn"
              list="filter-column-options"
              :known="known"
              placeholder="no sorting"
            />
            <select
              v-if="sort"
              :value="sort.direction"
              @change="setSortDirection($event.target.value)"
            >
              <option value="desc">highest first</option>
              <option value="asc">lowest first</option>
            </select>
          </div>
        </section>
      </div>

      <footer>
        <p v-if="matchCount != null" class="hint match">
          {{ matchCount }} of {{ totalCount }} players match.
        </p>
        <button
          type="button"
          class="short"
          :disabled="!positions.length && !filters.length"
          @click="clearAll"
        >
          Clear filters
        </button>
        <button type="button" class="short primary" @click="open = false">Done</button>
      </footer>
    </div>
  </dialog>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.filters-dialog {
  width: min(44rem, calc(100vw - 2rem));
  padding: 0;
  color: $text-color;
  background: color.adjust($background-color, $lightness: 3%);
  border: 1px solid color.adjust($background-color, $lightness: 15%);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);

  &::backdrop {
    background: rgba(0, 0, 0, 0.55);
  }
}

.dialog-body {
  padding: 1rem 1.25rem;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;

  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
}

button.close {
  padding: 0.1rem 0.55rem;
  font-size: 1.1rem;
  line-height: 1.4;
}

.sections {
  display: grid;
  // The positions column is as narrow as the pitch (its hint wraps); conditions get the rest.
  grid-template-columns: min-content minmax(0, 1fr);
  gap: 1rem 2.5rem;

  // Stack the sections on narrow screens only.
  @media (max-width: 40rem) {
    grid-template-columns: minmax(0, 1fr);
  }
}

// Conditions and sorting fill the right side; the column box takes the spare width.
// Each condition stays on one line; the column box takes the spare width.
.conditions .filter {
  flex-wrap: nowrap;

  .column-input {
    flex: 1 1 6rem;
    min-width: 0;
  }

  select {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 9rem;
  }

  .value {
    flex: 0 0 5rem;
    width: 5rem;
    min-width: 0;
  }
}

h3 {
  margin: 0.75rem 0 0.25rem;
  font-size: 1rem;
}

.hint {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  opacity: 0.7;
}

.hint.unavailable {
  color: #f2c94c;
  opacity: 1;
}

.pitch.disabled {
  opacity: 0.6;
}

.pitch {
  width: 14.7rem;
  display: grid;
  grid-template-columns: repeat(3, 4rem);
  gap: 0.35rem;
  padding: 0.75rem;
  background: rgba(47, 158, 110, 0.12);
  border: 1px solid rgba(47, 158, 110, 0.4);
  border-radius: 6px;
}

button.position {
  top: 0;
  left: 0;
  padding: 0.3rem 0;
  color: $text-color;
  font: inherit;
  font-size: 0.85rem;
  background-color: color.adjust($background-color, $lightness: 6%);
  border: 1px solid color.adjust($background-color, $lightness: 18%);
  border-radius: 4px;
  box-shadow: none;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: color.adjust($background-color, $lightness: 12%);
  }

  &.active,
  &.active:hover:not(:disabled) {
    background-color: #2f9e6e;
    border-color: #4fd39a;
  }
}

.filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.4rem;

  .value {
    width: 7rem;
  }
}

button.mini {
  padding: 0.1rem 0.45rem;
  font-size: 0.85rem;

  &.add {
    margin-top: 0.25rem;
  }
}

footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid color.adjust($background-color, $lightness: 10%);

  .match {
    margin: 0 auto 0 0;
  }
}
</style>
