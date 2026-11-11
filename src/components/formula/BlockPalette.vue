<script setup>
// Blocks to drag into the formula. Clicking a block puts it into the selected slot instead.
import { ref } from 'vue'

import { BLOCKS } from '@/services/expression'

import { DRAG_TYPE, useFormulaEditor } from './editorContext'

const emit = defineEmits(['insert'])
const editor = useFormulaEditor()
const trashOver = ref(false)

function onDragStart(event, blockId) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'new', blockId }))
  event.dataTransfer.effectAllowed = 'copy'
}

function onTrashOver(event) {
  if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
  event.preventDefault()
  trashOver.value = true
}

function onTrashDrop(event) {
  trashOver.value = false
  const raw = event.dataTransfer.getData(DRAG_TYPE)
  if (!raw) return
  event.preventDefault()
  const data = JSON.parse(raw)
  if (data.kind === 'move') editor.remove(data.path)
}
</script>

<template>
  <aside class="palette">
    <h3>Blocks</h3>
    <p class="hint">Drag a block into the formula, or select a slot and click a block.</p>
    <section
      v-for="group in BLOCKS"
      :key="group.group"
      :class="`group-${group.group.toLowerCase()}`"
    >
      <h4>{{ group.group }}</h4>
      <div class="items">
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="palette-block"
          draggable="true"
          :title="item.hint ?? item.label"
          :data-block="item.id"
          @dragstart="onDragStart($event, item.id)"
          @click="emit('insert', item.id)"
        >
          {{ item.label }}
        </button>
      </div>
    </section>

    <div
      class="trash"
      :class="{ over: trashOver, active: editor.dragging.value }"
      @dragover="onTrashOver"
      @dragleave="trashOver = false"
      @drop="onTrashDrop"
    >
      Drop here to delete
    </div>
  </aside>
</template>

<style lang="scss" scoped>
@use 'sass:color';

$colors: (
  values: #3d7bd9,
  math: #c27d1d,
  functions: #8a54c9,
  logic: #2f9e6e,
);

.palette {
  position: sticky;
  top: 1rem;
  padding: 0.75rem;
  background: color.adjust($background-color, $lightness: 3%);
  border: 1px solid color.adjust($background-color, $lightness: 12%);
  border-radius: 6px;

  @media (max-width: $sidebar-breakpoint) {
    position: static;
  }
}

h3 {
  margin: 0;
}

h4 {
  margin: 0.75rem 0 0.35rem;
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
}

.hint {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  opacity: 0.7;
}

.items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.palette-block {
  padding: 0.25rem 0.5rem;
  color: $text-color;
  font: inherit;
  font-size: 0.85rem;
  border: 1px solid;
  border-radius: 6px;
  cursor: grab;
}

@each $group, $color in $colors {
  .group-#{$group} .palette-block {
    background: color.change($color, $alpha: 0.18);
    border-color: color.change($color, $alpha: 0.7);

    &:hover {
      background: color.change($color, $alpha: 0.35);
    }
  }
}

.trash {
  margin-top: 1rem;
  padding: 0.75rem;
  font-size: 0.85rem;
  text-align: center;
  border: 1px dashed color.adjust($background-color, $lightness: 25%);
  border-radius: 6px;
  opacity: 0.6;

  &.active {
    border-color: #d65b5b;
    opacity: 1;
  }

  &.over {
    background: rgba(214, 91, 91, 0.25);
  }
}
</style>
