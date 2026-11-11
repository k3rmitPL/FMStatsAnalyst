<script setup>
// One slot of a formula: empty (a drop target) or holding a block, whose own slots are
// rendered recursively with this component.
import { computed, ref } from 'vue'

import {
  COMPARISONS,
  FUNCTIONS,
  OPERATORS,
  STATS,
  blockInfo,
  nodeCategory,
} from '@/services/expression'

import ColumnInput from './ColumnInput.vue'
import { DRAG_TYPE, useFormulaEditor } from './editorContext'

const props = defineProps({
  path: { type: Array, required: true },
  placeholder: { type: String, default: 'drop a block' },
})

const editor = useFormulaEditor()
const node = computed(() => editor.get(props.path))
const isOver = ref(false)
const blockEl = ref(null)

const isPath = (path) =>
  path?.length === props.path.length && path.every((key, i) => key === props.path[i])

const isSelected = computed(() => isPath(editor.selectedPath.value))

// Name tab: shown on the innermost hovered block only, so nested blocks don't all show one.
const isHovered = computed(() => isPath(editor.hoveredPath.value) && !editor.dragging.value)
const info = computed(() => blockInfo(node.value))

function onBlockOver() {
  editor.hoveredPath.value = props.path
}

function onBlockLeave() {
  if (isPath(editor.hoveredPath.value)) editor.hoveredPath.value = null
}

const fn = computed(() => (node.value?.type === 'call' ? FUNCTIONS[node.value.fn] : null))

function child(...keys) {
  return [...props.path, ...keys]
}

function accepts(event) {
  return event.dataTransfer.types.includes(DRAG_TYPE)
}

function onDragOver(event) {
  if (!accepts(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move'
  isOver.value = true
}

function onDrop(event) {
  isOver.value = false
  if (!accepts(event)) return
  event.preventDefault()
  editor.drop(props.path, event)
}

function onDragStart(event) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'move', path: props.path }))
  event.dataTransfer.effectAllowed = 'move'
  if (blockEl.value) event.dataTransfer.setDragImage(blockEl.value, 8, 8)
  editor.dragging.value = true
}

function onDragEnd() {
  editor.dragging.value = false
}

function addArg() {
  node.value.args.push(null)
}

function removeArg(index) {
  node.value.args.splice(index, 1)
}

function addWeighted() {
  node.value.items.push({ node: null, weight: 1 })
}

function removeWeighted(index) {
  node.value.items.splice(index, 1)
}

function addLookupRow() {
  node.value.table.push({ key: '', value: 1 })
}

function fillLookupKeys() {
  const existing = new Set(node.value.table.map((e) => e.key))
  for (const key of editor.distinctValues(node.value.column)) {
    if (!existing.has(key)) node.value.table.push({ key, value: node.value.default ?? 1 })
  }
}
</script>

<template>
  <span
    class="slot"
    :class="{ empty: !node, over: isOver, selected: isSelected }"
    @dragover.stop="onDragOver"
    @dragleave.stop="isOver = false"
    @drop.stop="onDrop"
    @click.stop="editor.select(path)"
  >
    <span v-if="!node" class="placeholder">{{ placeholder }}</span>

    <span
      v-else
      ref="blockEl"
      class="block"
      :class="[nodeCategory(node), node.type]"
      @mouseover.stop="onBlockOver"
      @mouseleave="onBlockLeave"
    >
      <span v-if="isHovered" class="name-tab" aria-hidden="true">
        {{ info.name }}
      </span>
      <span
        class="grip"
        draggable="true"
        title="Drag to move"
        @dragstart.stop="onDragStart"
        @dragend="onDragEnd"
        >⠿</span
      >

      <!-- Values -->
      <template v-if="node.type === 'number'">
        <input v-model.number="node.value" type="number" step="any" class="number-input" />
      </template>

      <template v-else-if="node.type === 'column'">
        <ColumnInput v-model="node.column" />
      </template>

      <template v-else-if="node.type === 'stat'">
        <select v-model="node.fn">
          <option v-for="(label, key) in STATS" :key="key" :value="key">{{ label }}</option>
        </select>
        <span class="word">of</span>
        <ColumnInput v-model="node.column" />
      </template>

      <template v-else-if="node.type === 'lookup'">
        <span class="lookup">
          <span class="row">
            <span class="word">lookup</span>
            <ColumnInput v-model="node.column" />
            <button
              type="button"
              class="mini"
              :disabled="!node.column"
              title="Add a row for every value of this column in the dataset"
              @click.stop="fillLookupKeys"
            >
              fill from data
            </button>
          </span>
          <span v-for="(entry, i) in node.table" :key="i" class="row">
            <input v-model="entry.key" class="key-input" placeholder="value" />
            <span class="word">→</span>
            <input v-model.number="entry.value" type="number" step="any" class="number-input" />
            <button
              type="button"
              class="mini"
              title="Remove row"
              @click.stop="node.table.splice(i, 1)"
            >
              ×
            </button>
          </span>
          <span class="row">
            <button type="button" class="mini" @click.stop="addLookupRow">+ row</button>
            <span class="word">otherwise</span>
            <input v-model.number="node.default" type="number" step="any" class="number-input" />
          </span>
        </span>
      </template>

      <!-- Math -->
      <template v-else-if="node.type === 'op'">
        <FormulaSlot :path="child('left')" />
        <select v-model="node.op" class="op-select">
          <option v-for="(def, key) in OPERATORS" :key="key" :value="key">{{ def.label }}</option>
        </select>
        <FormulaSlot :path="child('right')" />
      </template>

      <!-- Functions -->
      <template v-else-if="node.type === 'call'">
        <span class="word strong" :title="fn?.hint">{{ fn?.label ?? node.fn }}</span>
        <span class="word">(</span>
        <template v-for="(arg, i) in node.args" :key="i">
          <span v-if="i > 0" class="word">,</span>
          <FormulaSlot :path="child('args', i)" :placeholder="fn?.args?.[i] ?? 'value'" />
          <button
            v-if="fn?.variadic && node.args.length > (fn.minArgs ?? 1)"
            type="button"
            class="mini"
            title="Remove this value"
            @click.stop="removeArg(i)"
          >
            ×
          </button>
        </template>
        <button
          v-if="fn?.variadic"
          type="button"
          class="mini"
          title="Add a value"
          @click.stop="addArg"
        >
          +
        </button>
        <span class="word">)</span>
      </template>

      <!-- Logic -->
      <template v-else-if="node.type === 'if'">
        <span class="stack">
          <span class="row">
            <span class="word strong">if</span>
            <FormulaSlot :path="child('left')" />
            <select v-model="node.cmp" class="op-select">
              <option v-for="(def, key) in COMPARISONS" :key="key" :value="key">
                {{ def.label }}
              </option>
            </select>
            <FormulaSlot :path="child('right')" />
          </span>
          <span class="row">
            <span class="word strong">then</span>
            <FormulaSlot :path="child('then')" />
          </span>
          <span class="row">
            <span class="word strong">else</span>
            <FormulaSlot :path="child('else')" />
          </span>
        </span>
      </template>

      <template v-else-if="node.type === 'weighted'">
        <span class="stack">
          <span class="row"><span class="word strong">weighted average</span></span>
          <span v-for="(item, i) in node.items" :key="i" class="row">
            <FormulaSlot :path="child('items', i, 'node')" />
            <span class="word">weight</span>
            <input v-model.number="item.weight" type="number" step="any" class="number-input" />
            <button
              v-if="node.items.length > 1"
              type="button"
              class="mini"
              title="Remove this value"
              @click.stop="removeWeighted(i)"
            >
              ×
            </button>
          </span>
          <span class="row">
            <button type="button" class="mini" @click.stop="addWeighted">+ value</button>
          </span>
        </span>
      </template>

      <button
        type="button"
        class="remove"
        title="Delete block"
        :aria-label="`Delete ${node.type} block`"
        @click.stop="editor.remove(path)"
      >
        ×
      </button>
    </span>
  </span>
</template>

<style lang="scss" scoped>
@use 'sass:color';

$value: #3d7bd9;
$math: #c27d1d;
$function: #8a54c9;
$logic: #2f9e6e;

.slot {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  border-radius: 6px;

  &.empty {
    min-width: 5.5rem;
    min-height: 1.9rem;
    padding: 0 0.5rem;
    border: 1px dashed color.adjust($background-color, $lightness: 30%);
    cursor: pointer;
  }

  &.selected {
    outline: 2px solid #f2c94c;
    outline-offset: 1px;
  }

  &.over {
    outline: 2px solid #7fb7ff;
    outline-offset: 1px;
    background: rgba(127, 183, 255, 0.15);
  }
}

.placeholder {
  font-size: 0.75rem;
  font-style: italic;
  opacity: 0.6;
  white-space: nowrap;
}

// Blocks stay on one line; a wide formula scrolls sideways in the canvas.
.block {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.3rem 0.25rem 0.15rem;
  border: 1px solid color-mix(in srgb, var(--block-color) 70%, transparent);
  border-radius: 6px;
  position: relative;

  // Each category sets its colour once; the background, border and name tab use it.
  &.value {
    --block-color: #{$value};
    background: color.change($value, $alpha: 0.18);
  }
  &.math {
    --block-color: #{$math};
    background: color.change($math, $alpha: 0.16);
  }
  &.function {
    --block-color: #{$function};
    background: color.change($function, $alpha: 0.16);
  }
  &.logic {
    --block-color: #{$logic};
    background: color.change($logic, $alpha: 0.16);
  }
}

// A small folder-style tab on the block's top edge: "Functions · Average".
.name-tab {
  padding: 0.1rem 0.4rem;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: 0.02em;
  white-space: nowrap;
  background: var(--block-color);
  border-radius: 4px 4px 0 0;
  pointer-events: none;
  position: absolute;
  bottom: 100%;
  left: 0.4rem;
  z-index: 2;

  .separator {
    opacity: 0.6;
  }
}

.grip {
  padding: 0 0.15rem;
  opacity: 0.6;
  cursor: grab;
  user-select: none;

  &:hover {
    opacity: 1;
  }
}

.stack {
  display: inline-flex;
  flex-direction: column;
  gap: 0.3rem;
}

.row {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.3rem;
}

.lookup {
  display: inline-flex;
  flex-direction: column;
  gap: 0.3rem;
}

.word {
  font-size: 0.85rem;
  white-space: nowrap;
  opacity: 0.85;

  &.strong {
    font-weight: 600;
    opacity: 1;
  }
}

input,
select {
  padding: 0.15rem 0.3rem;
  color: $text-color;
  font: inherit;
  font-size: 0.85rem;
  background: color.adjust($background-color, $lightness: 6%);
  border: 1px solid color.adjust($background-color, $lightness: 20%);
  border-radius: 4px;
}

.number-input {
  width: 5rem;
}

.key-input {
  width: 10rem;
}

.op-select {
  font-size: 1rem;
  font-weight: 600;
}

.mini,
.remove {
  padding: 0 0.35rem;
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.4;
  border-radius: 4px;
  cursor: pointer;
}

.remove {
  margin-left: 0.15rem;
  opacity: 0.6;

  &:hover {
    background: #8a2d2d;
    opacity: 1;
  }
}
</style>
