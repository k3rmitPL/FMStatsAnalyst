// Loads one saved dataset for pages that need its columns or rows: the one last used in this
// browser, else the newest.

import { computed, ref, shallowRef, watch } from 'vue'

import { getImports, getRows } from '@/services/db'
import { readPreference, writePreference } from '@/utils/preferences'

export function useDataset({ loadRows = true } = {}) {
  const imports = ref([])
  const selectedId = ref(null)
  const rows = shallowRef([])
  const isLoading = ref(false)

  const dataset = computed(() => imports.value.find((i) => i.id === selectedId.value) ?? null)
  const columns = computed(() => dataset.value?.columns ?? [])
  const columnInfo = computed(() => dataset.value?.columnInfo ?? {})

  async function loadImports() {
    imports.value = await getImports()
    const exists = (id) => imports.value.some((i) => i.id === id)
    if (exists(selectedId.value)) return
    const remembered = readPreference('dataset', null)
    selectedId.value = exists(remembered) ? remembered : (imports.value[0]?.id ?? null)
  }

  watch(selectedId, (id) => id != null && writePreference('dataset', id))

  if (loadRows) {
    watch(selectedId, async (id) => {
      rows.value = []
      if (id == null) return
      isLoading.value = true
      try {
        rows.value = await getRows(id)
      } finally {
        isLoading.value = false
      }
    })
  }

  loadImports()

  return { imports, selectedId, dataset, columns, columnInfo, rows, isLoading }
}
