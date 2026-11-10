// User-defined metrics and views, kept in IndexedDB and shared by all pages.
// `metrics` and `views` hold the saved versions (persisted whenever they change). The metrics
// editor works on drafts and writes them back with an explicit save; metrics can be organised in
// groups. Views are edited on the Analyze page, which writes them here directly.

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { createDrafts } from './drafts'
import { createGroups, parseGroups } from './groups'
import { getConfig, saveConfig } from '@/services/db'
import { downloadJson, readJsonFile } from '@/services/fileTransfer'
import { metricsFile, parseMetricsFile } from '@/services/metrics'
import { parseViewsFile, viewsFile, withoutGroup } from '@/services/views'

/** Adds imported items; an item with the same id as an existing one replaces it. */
function merge(existing, imported) {
  const result = [...existing]
  let replaced = 0
  for (const item of imported) {
    const index = result.findIndex((e) => e.id === item.id)
    if (index === -1) result.push(item)
    else {
      result[index] = item
      replaced++
    }
  }
  return { result, added: imported.length - replaced, replaced }
}

export const useLibraryStore = defineStore('library', () => {
  const metrics = ref([])
  const views = ref([])
  const metricGroupList = ref([])
  const loaded = ref(false)
  let loading = null

  const metricDrafts = createDrafts(metrics)
  const metricGroups = createGroups(metricGroupList, metrics, metricDrafts)

  function load() {
    loading ??= Promise.all(['metrics', 'views', 'metricGroups'].map((key) => getConfig(key))).then(
      ([m, v, mg]) => {
        metrics.value = m
        // Views are no longer grouped; drop group references left from older versions.
        views.value = v.map(withoutGroup)
        metricGroupList.value = mg
        loaded.value = true
        watch(metrics, (value) => saveConfig('metrics', value), { deep: true })
        watch(views, (value) => saveConfig('views', value), { deep: true })
        watch(metricGroupList, (value) => saveConfig('metricGroups', value), { deep: true })
        window.addEventListener('beforeunload', (event) => {
          if (metricDrafts.dirtyCount) event.preventDefault()
        })
      },
    )
    return loading
  }

  async function importMetrics(file) {
    const data = await readJsonFile(file)
    const imported = parseMetricsFile(data)
    metricGroups.merge(parseGroups(data))
    const { result, added, replaced } = merge(metrics.value, imported)
    metrics.value = result
    // Imported items replace any unsaved edits of the same items.
    for (const item of imported) metricDrafts.discard(item.id)
    return { added, replaced }
  }

  async function importViews(file) {
    const imported = parseViewsFile(await readJsonFile(file))
    const { result, added, replaced } = merge(views.value, imported)
    views.value = result
    return { added, replaced }
  }

  function deleteView(id) {
    views.value = views.value.filter((v) => v.id !== id)
  }

  function exportMetrics() {
    downloadJson('fm-metrics.json', metricsFile(metrics.value, metricGroupList.value))
  }

  function exportViews() {
    downloadJson('fm-views.json', viewsFile(views.value))
  }

  return {
    metrics,
    views,
    loaded,
    metricDrafts,
    metricGroups,
    load,
    importMetrics,
    importViews,
    deleteView,
    exportMetrics,
    exportViews,
  }
})
