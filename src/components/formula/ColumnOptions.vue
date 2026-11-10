<script setup>
// The <datalist> used by ColumnInput: raw column names, with readable labels.
import { columnLabel } from '@/utils/columns'

defineProps({
  id: { type: String, default: 'column-options' },
  columns: { type: Array, required: true },
  columnInfo: { type: Object, default: () => ({}) },
})
</script>

<template>
  <datalist :id="id">
    <option v-for="col in columns" :key="col" :value="col">
      {{ columnLabel(col, columnInfo[col]) }}
    </option>
  </datalist>
</template>
