<script setup>
// Choosing, loading and deleting the dataset of the Analyse page, shared by its tabs.
import { useRouter } from 'vue-router'

import CSVFileInput from '@/components/CSVFileInput.vue'
import { useAnalysisStore } from '@/stores/analysis'

const router = useRouter()
const analysis = useAnalysisStore()

function formatDate(iso) {
  return new Date(iso).toLocaleString()
}

async function removeSelected() {
  const current = analysis.selectedImport
  if (!current) return
  if (!confirm(`Delete "${current.fileName}" (${current.rowCount} rows)? This cannot be undone.`)) {
    return
  }
  await analysis.deleteSelected()
}
</script>

<template>
  <label>
    Dataset
    <select v-model="analysis.selectedId">
      <option v-for="imp in analysis.imports" :key="imp.id" :value="imp.id">
        {{ imp.fileName }} — {{ imp.rowCount }} rows — {{ formatDate(imp.importedAt) }}
      </option>
    </select>
  </label>

  <CSVFileInput @imported="(id) => analysis.loadImports(id)" />
  <button
    type="button"
    class="short join-left"
    title="Merge several CSV files into one dataset, with custom columns"
    @click="router.push('/import')"
  >
    Advanced import...
  </button>
  <button type="button" class="short danger" @click="removeSelected">Delete dataset</button>
</template>
