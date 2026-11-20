// User-defined metrics, views and dashboards, kept in IndexedDB and shared by all pages.
// `metrics`, `views` and `dashboards` hold the saved versions (persisted whenever they change).
// The metrics editor works on drafts and writes them back with an explicit save; metrics can be
// organised in groups. Views and dashboards are edited on the Analyse page (Table and Charts tabs), which writes
// them here directly.

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { createDrafts } from './drafts'
import { createGroups, parseGroups } from './groups'
import { getConfig, saveConfig } from '@/services/db'
import { downloadJson, readJsonFile } from '@/services/fileTransfer'
import { dashboardsFile, normalizeDashboard, parseDashboardsFile } from '@/services/dashboards'
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
  const dashboards = ref([])
  const metricGroupList = ref([])
  const loaded = ref(false)
  let loading = null

  const metricDrafts = createDrafts(metrics)
  const metricGroups = createGroups(metricGroupList, metrics, metricDrafts)

  function load() {
    loading ??= Promise.all(
      ['metrics', 'views', 'metricGroups', 'dashboards'].map((key) => getConfig(key)),
    ).then(([m, v, mg, d]) => {
      metrics.value = m
      // Views are no longer grouped; drop group references left from older versions.
      views.value = v.map(withoutGroup).sort((a, b) => {
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()
        if (aName < bName) return -1
        if (aName > bName) return 1
        return 0
      })

      metricGroupList.value = mg
      dashboards.value = d.map(normalizeDashboard)
      loaded.value = true
      watch(metrics, (value) => saveConfig('metrics', value), { deep: true })
      watch(views, (value) => saveConfig('views', value), { deep: true })
      watch(metricGroupList, (value) => saveConfig('metricGroups', value), { deep: true })
      watch(dashboards, (value) => saveConfig('dashboards', value), { deep: true })
      window.addEventListener('beforeunload', (event) => {
        if (metricDrafts.dirtyCount) event.preventDefault()
      })
    })
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

  async function importDashboards(file) {
    const imported = parseDashboardsFile(await readJsonFile(file))
    const { result, added, replaced } = merge(dashboards.value, imported)
    dashboards.value = result
    return { added, replaced }
  }

  function deleteDashboard(id) {
    dashboards.value = dashboards.value.filter((d) => d.id !== id)
  }

  function exportMetrics() {
    downloadJson('fm-metrics.json', metricsFile(metrics.value, metricGroupList.value))
  }

  function exportViews() {
    downloadJson('fm-views.json', viewsFile(views.value))
  }

  function exportDashboards() {
    downloadJson('fm-dashboards.json', dashboardsFile(dashboards.value))
  }

  return {
    metrics,
    views,
    dashboards,
    loaded,
    metricDrafts,
    metricGroups,
    load,
    importMetrics,
    importViews,
    deleteView,
    importDashboards,
    deleteDashboard,
    exportMetrics,
    exportViews,
    exportDashboards,
  }
})
