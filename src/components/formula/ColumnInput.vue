<script setup>
// Text box for a column name, with suggestions from a <datalist> rendered by the page
// (see ColumnOptions.vue). Unknown names are outlined in red.
import { computed } from 'vue'

import { columnLabel } from '@/utils/columns'

import { useFormulaEditor } from './editorContext'

const model = defineModel({ type: String, default: '' })
const props = defineProps({
  list: { type: String, default: 'column-options' },
  // Set of valid column names; falls back to the formula editor's known columns.
  known: { type: Set, default: null },
  placeholder: { type: String, default: 'column' },
})

const editor = useFormulaEditor()
const knownSet = computed(() => props.known ?? editor?.knownColumns.value ?? null)
const unknown = computed(() => !!model.value && knownSet.value && !knownSet.value.has(model.value))
const size = computed(() =>
  Math.max(8, Math.min(32, (model.value || props.placeholder).length + 1)),
)
const title = computed(() => {
  if (!model.value) return 'Type or pick a column'
  if (unknown.value) return `"${model.value}" is not in the selected dataset`
  return columnLabel(model.value)
})
</script>

<template>
  <input
    v-model.trim="model"
    type="text"
    class="column-input"
    :class="{ unknown }"
    :list="list"
    :size="size"
    :placeholder="placeholder"
    :title="title"
  />
</template>

<style lang="scss" scoped>
@use 'sass:color';

.column-input {
  font-size: 0.85rem;

  &.unknown {
    border-color: #d65b5b;
  }
}
</style>
