<script setup>
// Picks the metrics of a chart: a dropdown with a filter and a checkbox per column, up to `max`.
// The chosen metrics keep the order they were picked in. With `single`, one metric (e.g. a scatter
// axis): radio buttons, the button shows the chosen metric, and picking one closes the dropdown.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { foldText } from '@/utils/text'

const props = defineProps({
  // Columns that can be picked, in table order.
  columns: { type: Array, required: true },
  // Display label of a column.
  label: { type: Function, default: (col) => col },
  max: { type: Number, default: Infinity },
  // Button text, before the count.
  title: { type: String, default: 'Metrics' },
  buttonClass: { type: Object, required: false },
  // One metric at most (the model is still an array: [] or [metric]).
  single: { type: Boolean, default: false },
  // Button text while nothing is picked (single).
  placeholder: { type: String, default: 'Choose a metric' },
})

// Picked columns, in pick order.
const picked = defineModel({ type: Array, required: true })

const isOpen = ref(false)
const filter = ref('')
const root = ref(null)
const filterInput = ref(null)
const pickedSet = computed(() => new Set(picked.value))
// A single picker swaps its metric instead of filling up.
const isFull = computed(() => !props.single && picked.value.length >= props.max)

// Picked columns first (in pick order), then the others matching the filter.
const shownColumns = computed(() => {
  const term = foldText(filter.value.trim())
  const matches = (col) =>
    !term || foldText(col).includes(term) || foldText(props.label(col)).includes(term)
  const rest = props.columns.filter((c) => !pickedSet.value.has(c) && matches(c))
  return [...picked.value.filter(matches), ...rest]
})

function setPicked(col, on) {
  if (props.single) {
    if (on) {
      picked.value = [col]
      isOpen.value = false
    }
    return
  }
  if (on && !pickedSet.value.has(col) && !isFull.value) picked.value = [...picked.value, col]
  if (!on) picked.value = picked.value.filter((c) => c !== col)
}

function onDocumentPointerDown(evt) {
  if (isOpen.value && root.value && !root.value.contains(evt.target)) isOpen.value = false
}

// The dropdown opens below its button and stays inside the area it can be seen in: the nearest
// container that clips it (e.g. the table's scrolling chart panel), inside that container's
// padding, so it keeps the same margin as the container's content; else the screen,
// BOTTOM_GAP_REM from its edges. Its list reaches down to that bottom edge, but always shows a few
// rows. It is placed on the screen (position: fixed), so it never makes that container scroll.
const BOTTOM_GAP_REM = 1
const MIN_LIST_HEIGHT = 96
// Space between the button and the dropdown (rem), as in the styles.
const DROPDOWN_OFFSET_REM = 0.5
const toggle = ref(null)
const list = ref(null)
const panel = ref(null)
const listHeight = ref(null)
// { top, left, maxWidth } in px, or null before the first measurement.
const placement = ref(null)
// Fixed from the start (hidden until placed), so it never makes its container scrollable.
const panelStyle = computed(() =>
  placement.value
    ? {
        position: 'fixed',
        top: `${placement.value.top}px`,
        left: `${placement.value.left}px`,
        maxWidth: `${placement.value.maxWidth}px`,
      }
    : { position: 'fixed', top: '0', left: '0', visibility: 'hidden' },
)
// Follows size changes of the clipping container (e.g. a chart redrawn at another size).
let areaObserver = null

/** The nearest ancestor that clips its overflow, or null (only the screen limits the dropdown). */
function clippingAncestor() {
  for (let el = root.value?.parentElement; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') return el
  }
  return null
}

function fitToScreen() {
  if (!isOpen.value || !list.value || !panel.value || !toggle.value) return
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  let bottom = window.innerHeight - BOTTOM_GAP_REM * rem
  let right = window.innerWidth - BOTTOM_GAP_REM * rem
  const area = clippingAncestor()
  if (area) {
    const rect = area.getBoundingClientRect()
    const style = getComputedStyle(area)
    bottom = Math.min(
      bottom,
      rect.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom),
    )
    right = Math.min(
      right,
      rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
    )
  }
  const button = toggle.value.getBoundingClientRect()
  const top = button.bottom + DROPDOWN_OFFSET_REM * rem
  placement.value = { top, left: button.left, maxWidth: Math.floor(right - button.left) }
  // The list is measured once the dropdown is in its place (and width).
  nextTick(() => {
    if (!list.value || !panel.value) return
    const dropdownStyle = getComputedStyle(panel.value)
    // Below the list: the dropdown's bottom padding and border.
    const below =
      parseFloat(dropdownStyle.paddingBottom) + parseFloat(dropdownStyle.borderBottomWidth)
    const listTop = list.value.getBoundingClientRect().top
    listHeight.value = Math.max(MIN_LIST_HEIGHT, Math.floor(bottom - below - listTop))
  })
}

async function open() {
  isOpen.value = true
  filter.value = ''
  await nextTick()
  fitToScreen()
  const area = clippingAncestor()
  if (area) {
    areaObserver = new ResizeObserver(fitToScreen)
    areaObserver.observe(area)
  }
  // Once placed: until then it is hidden, and a hidden input can't take the focus. Without
  // scrolling: the dropdown is placed to be in view already.
  await nextTick()
  filterInput.value?.focus({ preventScroll: true })
}

watch(isOpen, (value) => {
  if (value) return
  areaObserver?.disconnect()
  areaObserver = null
  placement.value = null
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('resize', fitToScreen)
  // Scrolling the page, a dialog or the chart panel moves the button.
  window.addEventListener('scroll', fitToScreen, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('resize', fitToScreen)
  window.removeEventListener('scroll', fitToScreen, true)
  areaObserver?.disconnect()
})
</script>

<template>
  <div ref="root" class="metric-picker" @keydown.esc="isOpen = false">
    <button
      ref="toggle"
      type="button"
      :class="{ 'dropdown-expand': true, single, ...props.buttonClass }"
      :aria-expanded="isOpen"
      :title="single && picked.length ? label(picked[0]) : undefined"
      @click="isOpen ? (isOpen = false) : open()"
    >
      <template v-if="single">{{ picked.length ? label(picked[0]) : placeholder }}</template>
      <template v-else
        >{{ title }} ({{ picked.length }}<template v-if="Number.isFinite(max)">/{{ max }}</template
        >)</template
      >
    </button>

    <div v-if="isOpen" ref="panel" class="panel" :style="panelStyle">
      <div class="controls">
        <input ref="filterInput" v-model="filter" type="search" placeholder="Filter metrics" />
        <div v-if="!single" class="actions">
          <button type="button" :disabled="!picked.length" @click="picked = []">Clear</button>
          <span v-if="isFull" class="full">At most {{ max }} metrics</span>
        </div>
      </div>
      <ul ref="list" :style="listHeight ? { maxHeight: `${listHeight}px` } : undefined">
        <li v-for="col in shownColumns" :key="col">
          <label :title="col" :class="{ disabled: isFull && !pickedSet.has(col) }">
            <input
              :type="single ? 'radio' : 'checkbox'"
              :checked="pickedSet.has(col)"
              :disabled="isFull && !pickedSet.has(col)"
              @change="setPicked(col, $event.target.checked)"
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

.metric-picker {
  position: relative;
}

// A single picker's button shows a metric name, cut short when it doesn't fit.
button.single {
  max-width: 100%;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel {
  position: absolute;
  z-index: 1000;
  top: calc(100% + 0.5rem);
  left: 0;
  width: min(20rem, calc(100vw - 2rem));
  padding: 0.75rem;
  background: color.adjust($background-color, $lightness: 3%);
  border: 1px solid color.adjust($background-color, $lightness: 15%);
  border-radius: 5px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

input[type='search'] {
  width: 100%;
}

.controls {
  margin: 0 0 0.5rem;
  gap: 0.5rem;
  display: flex;
  align-items: center;
  flex-direction: row;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  button {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
  }

  .full {
    font-size: 0.8rem;
    opacity: 0.7;
    white-space: nowrap;
  }
}

// Until measured (see fitToScreen).
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

  &.disabled {
    cursor: default;
    opacity: 0.45;
  }
}
</style>
