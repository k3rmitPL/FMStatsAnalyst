<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  // Raw column names, in table order.
  columns: { type: Array, required: true },
  // Function returning the display label for a column.
  label: { type: Function, default: (col) => col },
})

// Set of hidden column names.
const hidden = defineModel({ type: Set, required: true })

const isOpen = ref(false)
const filter = ref('')
const root = ref(null)
const filterInput = ref(null)

const visibleCount = computed(() => props.columns.filter((c) => !hidden.value.has(c)).length)

const filteredColumns = computed(() => {
  const term = filter.value.trim().toLowerCase()
  if (!term) return props.columns
  return props.columns.filter(
    (col) => col.toLowerCase().includes(term) || props.label(col).toLowerCase().includes(term),
  )
})

function setVisible(col, visible) {
  const next = new Set(hidden.value)
  if (visible) next.delete(col)
  else next.add(col)
  hidden.value = next
}

// Show/hide applies to the columns matching the current filter.
function setAll(visible) {
  const next = new Set(hidden.value)
  for (const col of filteredColumns.value) {
    if (visible) next.delete(col)
    else next.add(col)
  }
  hidden.value = next
}

function onDocumentPointerDown(evt) {
  if (isOpen.value && root.value && !root.value.contains(evt.target)) isOpen.value = false
}

function onKeydown(evt) {
  if (evt.key === 'Escape') isOpen.value = false
}

async function open() {
  isOpen.value = true
  filter.value = ''
  await nextTick()
  filterInput.value?.focus()
}

function close() {
  isOpen.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="column-picker" @keydown="onKeydown">
    <button
      type="button"
      class="dropdown-expand"
      :aria-expanded="isOpen"
      @click="isOpen ? close() : open()"
    >
      Columns ({{ visibleCount }}/{{ columns.length }})
    </button>

    <div v-if="isOpen" class="panel">
      <input ref="filterInput" v-model="filter" type="search" placeholder="Filter columns" />
      <div class="actions">
        <button type="button" @click="setAll(true)">Show all</button>
        <button type="button" @click="setAll(false)">Hide all</button>
      </div>
      <ul>
        <li v-for="col in filteredColumns" :key="col">
          <label :title="col">
            <input
              type="checkbox"
              :checked="!hidden.has(col)"
              @change="setVisible(col, $event.target.checked)"
            />
            {{ label(col) }}
          </label>
        </li>
      </ul>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.column-picker {
  position: relative;
}

.panel {
  position: absolute;
  z-index: 1000;
  top: calc(100% + 0.5rem);
  left: 0;
  width: 20rem;
  padding: 0.75rem;
  background: color.adjust($background-color, $lightness: 3%);
  border: 1px solid color.adjust($background-color, $lightness: 15%);
  border-radius: 5px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

input[type='search'] {
  width: 100%;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin: 0.5rem 0;

  button {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
  }
}

ul {
  max-height: 50vh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.15rem 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;

  &:hover {
    background: color.adjust($background-color, $lightness: 8%);
  }
}
</style>
