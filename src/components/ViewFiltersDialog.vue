<script setup>
// Popup for the row filters of the table's view: positions on a pitch and column conditions
// (grouped with AND/OR, switchable and reorderable). Changes apply to the table right away;
// saving them is up to the page. Sorting is done in the table itself.

import { computed, onBeforeUnmount, ref, watch } from 'vue'

import ColumnInput from '@/components/formula/ColumnInput.vue'
import ColumnOptions from '@/components/formula/ColumnOptions.vue'
import PositionPicker from '@/components/PositionPicker.vue'
import { FILTER_COMPARISONS, filterGroups } from '@/services/views'

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
// [{ column, cmp, value, join: 'and' | 'or', enabled }], see services/views.js
const filters = defineModel('filters', { type: Array, required: true })

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

// Stable keys for the condition rows, so their inputs follow them when they are reordered.
// Kept in step with `filters` by the functions below; rebuilt when the list is replaced.
let nextKey = 0
const keys = ref([])
watch(
  () => filters.value.length,
  (length) => {
    if (keys.value.length !== length) keys.value = filters.value.map(() => nextKey++)
  },
  { immediate: true },
)

// Where each row sits in its group, for the bracket: groups of one get none.
const bracketRoles = computed(() => {
  const roles = []
  for (const group of filterGroups(filters.value)) {
    group.forEach((index, n) => {
      if (group.length < 2) roles[index] = null
      else roles[index] = n === 0 ? 'start' : n === group.length - 1 ? 'end' : 'mid'
    })
  }
  return roles
})

function updateFilter(index, changes) {
  filters.value = filters.value.map((f, i) => (i === index ? { ...f, ...changes } : f))
}

function toggleJoin(index) {
  if (index === 0) return
  updateFilter(index, { join: filters.value[index].join === 'or' ? 'and' : 'or' })
}

function addFilter() {
  keys.value = [...keys.value, nextKey++]
  filters.value = [
    ...filters.value,
    { column: 'Minutes', cmp: '>=', value: 600, join: 'and', enabled: true },
  ]
}

function removeFilter(index) {
  keys.value = keys.value.filter((_, i) => i !== index)
  filters.value = filters.value.filter((_, i) => i !== index)
}

function moveFilter(from, to) {
  const move = (list) => {
    const copy = [...list]
    copy.splice(to, 0, ...copy.splice(from, 1))
    return copy
  }
  keys.value = move(keys.value)
  filters.value = move(filters.value)
}

// Reordering, like the table's column headers: press the grip and drag; a translucent copy of the
// row follows the pointer, a line marks where it would land, and it moves on release. Pointer
// events (rather than HTML drag and drop) also work on touch screens.
const list = ref(null)
const dragIndex = ref(null)
// Insertion point (0..filters.length) in the current order; null when the drop would not move it.
const dropIndex = ref(null)
let ghostLayer = null
let ghost = null
let grabOffset = { x: 0, y: 0 }

function startDrag(index, event) {
  if (event.button !== 0) return
  event.preventDefault()
  const row = event.currentTarget.closest('.filter')
  const rect = row.getBoundingClientRect()
  grabOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }

  ghost = row.cloneNode(true)
  // Form values live in DOM properties, which cloning does not copy.
  const sources = row.querySelectorAll('input, select')
  ghost.querySelectorAll('input, select').forEach((el, i) => {
    el.value = sources[i].value
    if (el.type === 'checkbox') el.checked = sources[i].checked
  })
  ghost.classList.add('drag-ghost')
  ghost.inert = true
  ghost.style.width = `${rect.width}px`
  // The layer carries the `conditions` class, so the row's scoped styles still apply to the copy.
  // It goes into the <dialog> to share its top layer.
  ghostLayer = document.createElement('div')
  ghostLayer.className = 'conditions'
  ghostLayer.setAttribute('aria-hidden', 'true')
  ghostLayer.appendChild(ghost)
  dialog.value.appendChild(ghostLayer)
  moveGhost(event)

  dragIndex.value = index
  dropIndex.value = null
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDrop)
  window.addEventListener('pointercancel', endDrag)
}

function moveGhost(event) {
  ghost.style.left = `${event.clientX - grabOffset.x}px`
  ghost.style.top = `${event.clientY - grabOffset.y}px`
}

function onDragMove(event) {
  if (dragIndex.value == null || !list.value) return
  moveGhost(event)
  const rows = list.value.querySelectorAll(':scope > .filter')
  let target = 0
  rows.forEach((row) => {
    const rect = row.getBoundingClientRect()
    if (event.clientY > rect.top + rect.height / 2) target++
  })
  // Dropping right above or below itself leaves the row where it is.
  const from = dragIndex.value
  dropIndex.value = target === from || target === from + 1 ? null : target
}

function onDrop() {
  const from = dragIndex.value
  const to = dropIndex.value
  endDrag()
  if (from != null && to != null) moveFilter(from, to > from ? to - 1 : to)
}

function endDrag() {
  dragIndex.value = null
  dropIndex.value = null
  ghostLayer?.remove()
  ghostLayer = ghost = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDrop)
  window.removeEventListener('pointercancel', endDrag)
}

onBeforeUnmount(endDrag)

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
          <PositionPicker v-model="positions" :column-info="columnInfo" />
        </section>

        <section class="conditions">
          <h3>Conditions</h3>
          <p class="hint">
            OR conditions join the AND condition above them (bracketed); every group must match.
          </p>
          <div ref="list" class="filter-list" :class="{ dragging: dragIndex != null }">
            <div
              v-for="(filter, i) in filters"
              :key="keys[i] ?? `i${i}`"
              class="filter"
              :class="{
                off: filter.enabled === false,
                dragged: dragIndex === i,
                'drop-before': dropIndex === i,
                'drop-after': dropIndex === filters.length && i === filters.length - 1,
              }"
            >
              <span
                class="grip"
                title="Drag to reorder"
                aria-hidden="true"
                @pointerdown="startDrag(i, $event)"
                >⠿</span
              >
              <span class="bracket" :class="bracketRoles[i]" aria-hidden="true"></span>
              <button
                type="button"
                class="join"
                :class="{ or: i > 0 && filter.join === 'or' }"
                :disabled="i === 0"
                :title="
                  i === 0
                    ? 'The first condition always starts a group'
                    : 'Switch between AND (new group) and OR (join the group above)'
                "
                @click="toggleJoin(i)"
              >
                {{ i > 0 && filter.join === 'or' ? 'OR' : 'AND' }}
              </button>
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
              <input
                type="checkbox"
                class="enabled"
                :checked="filter.enabled !== false"
                :title="filter.enabled === false ? 'Switched off' : 'Switched on'"
                aria-label="Use this condition"
                @change="updateFilter(i, { enabled: $event.target.checked })"
              />
              <button type="button" class="mini" title="Remove condition" @click="removeFilter(i)">
                ×
              </button>
            </div>
          </div>
          <button type="button" class="mini add" @click="addFilter">+ Add condition</button>
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
  width: min(50rem, calc(100vw - 2rem));
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

// Each condition stays on one line; the column box takes the spare width. Rows have no margin
// so the group brackets run unbroken from one row to the next.
.conditions .filter {
  flex-wrap: nowrap;
  gap: 0.3rem;
  margin: 0;
  padding: 0.2rem 0;

  &.off > :not(.grip, .bracket, .enabled, .mini) {
    opacity: 0.45;
  }

  position: relative;

  // Drag and drop: the dragged row fades, a line marks where it would go.
  &.dragged {
    opacity: 0.4;
  }

  &.drop-before::after,
  &.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: $accent-color;
    border-radius: 1px;
    pointer-events: none;
  }

  &.drop-before::after {
    top: -1px;
  }

  &.drop-after::after {
    bottom: -1px;
  }

  // The copy that follows the pointer.
  &.drag-ghost {
    position: fixed;
    z-index: 10;
    margin: 0;
    padding: 0.2rem 0.3rem;
    opacity: 0.7;
    background: color.adjust($background-color, $lightness: 8%);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    cursor: grabbing;
  }

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

  .enabled {
    flex: 0 0 auto;
    margin: 0;
    cursor: pointer;
  }

  // Phones: keep the column name readable at the cost of the value box.
  @media (max-width: 40rem) {
    .column-input {
      min-width: 4.5rem;
    }

    .value {
      flex-basis: 3rem;
      width: 3rem;
    }
  }
}

.filter-list.dragging {
  cursor: grabbing;
  user-select: none;
}

.grip {
  flex: 0 0 auto;
  padding: 0 0.1rem;
  font-size: 1rem;
  line-height: 1;
  opacity: 0.5;
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:hover {
    opacity: 0.9;
  }

  .dragging & {
    cursor: grabbing;
  }
}

// "[" drawn from the middle of a group's first row to the middle of its last.
.bracket {
  position: relative;
  flex: 0 0 0.45rem;
  align-self: stretch;

  &.start::before,
  &.mid::before,
  &.end::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    border-left: 2px solid $accent-color;
  }

  &.start::before {
    top: 50%;
    bottom: -0.2rem;
    border-top: 2px solid $accent-color;
    border-top-left-radius: 3px;
  }

  &.mid::before {
    top: -0.2rem;
    bottom: -0.2rem;
  }

  &.end::before {
    top: -0.2rem;
    bottom: 50%;
    border-bottom: 2px solid $accent-color;
    border-bottom-left-radius: 3px;
  }
}

button.join {
  flex: 0 0 2.6rem;
  padding: 0.1rem 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.03em;

  &.or {
    color: $accent-color;
    border-color: $accent-color;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
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
