<script setup>
// The metric columns of a butterfly chart: a metric picker per column (up to 7 metrics), a button
// removing a column, and one adding a column (up to 3).
import MetricPicker from '@/components/charts/MetricPicker.vue'
import {
  BUTTERFLY_MAX_COLUMNS,
  BUTTERFLY_MAX_METRICS_PER_COLUMN,
} from '@/services/charts/butterfly'

defineProps({
  // Columns that can be picked, and their display label.
  metricColumns: { type: Array, required: true },
  label: { type: Function, required: true },
})

// [[metric, ...], ...], 1-3 columns.
const columns = defineModel({ type: Array, required: true })

function setColumn(index, metrics) {
  columns.value = columns.value.map((c, i) => (i === index ? metrics : c))
}

function addColumn() {
  if (columns.value.length < BUTTERFLY_MAX_COLUMNS) columns.value = [...columns.value, []]
}

// The last remaining column can't be removed (its metrics can be cleared instead).
function removeColumn(index) {
  if (columns.value.length > 1) columns.value = columns.value.filter((_, i) => i !== index)
}
</script>

<template>
  <span v-for="(col, i) in columns" :key="i" class="column-picker">
    <MetricPicker
      :model-value="col"
      :columns="metricColumns"
      :label="label"
      :max="BUTTERFLY_MAX_METRICS_PER_COLUMN"
      title="Metrics"
      :button-class="{ 'join-right': columns.length > 1 }"
      @update:model-value="(value) => setColumn(i, value)"
    />
    <button
      v-if="columns.length > 1"
      type="button"
      class="short join-left"
      :title="`Remove column ${i + 1}`"
      :aria-label="`Remove column ${i + 1}`"
      @click="removeColumn(i)"
    >
      ✕
    </button>
  </span>
  <button
    v-if="columns.length < BUTTERFLY_MAX_COLUMNS"
    type="button"
    class="short"
    title="Add a column of metrics"
    @click="addColumn"
  >
    + Column
  </button>
</template>

<style scoped>
.column-picker {
  display: inline-flex;
  gap: 0.5rem;
}
</style>
