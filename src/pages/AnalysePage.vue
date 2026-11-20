<script setup>
// The Analyse page: the dataset shared by its tabs (Table and Charts), each shown in the nested
// route. Tabs are kept alive, so switching keeps each tab's state (unsaved view changes, search,
// page, ...).
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CSVFileInput from '@/components/CSVFileInput.vue'
import { useAnalysisStore } from '@/stores/analysis'

// Where the app is served from, for links to files in public/ (e.g. '/' or '/fm/').
const BASE_URL = import.meta.env.BASE_URL

const TABS = [
  { name: 'analyse-table', label: 'Table' },
  { name: 'analyse-charts', label: 'Charts' },
]

const route = useRoute()
const router = useRouter()
const analysis = useAnalysisStore()

// The dataset in the URL wins (links from the home and import pages), then the one last used.
// Read before the watcher below writes the current dataset into the URL.
const datasetFromUrl = Number(route.query.import) || null
onMounted(() => analysis.loadImports(datasetFromUrl))

// Keep the dataset in the URL, so a reload or a shared link opens the same one. Immediate: the
// store keeps the dataset between visits, so it may not change when the page opens.
watch(
  () => analysis.selectedId,
  (id) => {
    if (id == null || Number(route.query.import) === id) return
    router.replace({ query: { ...route.query, import: id } })
  },
  { immediate: true },
)

/** A tab's link: the dataset goes along, the table's view and the dashboard only to their tab. */
function tabLink(name) {
  const query = { ...route.query }
  if (name !== 'analyse-table') delete query.view
  if (name !== 'analyse-charts') delete query.dashboard
  return { name, query }
}
</script>

<template>
  <div class="heading">
    <h1>Analyse</h1>
    <nav v-if="analysis.imports.length" class="tabs" aria-label="Analyse views">
      <RouterLink
        v-for="tab in TABS"
        :key="tab.name"
        :to="tabLink(tab.name)"
        class="tab"
        active-class="active"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
  </div>

  <div v-if="!analysis.imports.length" class="empty-state">
    <p>No data saved yet.</p>
    <p>
      Download the
      <a :href="`${BASE_URL}data/Full%20Export%20View.fmf`" download>Full Export View.fmf</a>
      and import it in Football Manager as a starting point. It includes most player stats.
    </p>
    <p>
      Then use
      <a href="https://github.com/ElectroHugin/FM-View-Exporter" target="_blank" rel="noopener"
        >FM View Exporter</a
      >
      to export the players to a CSV file (don't forget to set <code>ScanColumns = true</code> in
      the plugin's config), and load it here:
    </p>
    <CSVFileInput @imported="(id) => analysis.loadImports(id)" />
    <p>
      Or use the <RouterLink to="/import">advanced import</RouterLink> to merge several CSV files
      into one dataset and add your own columns.
    </p>
  </div>

  <RouterView v-else v-slot="{ Component }">
    <KeepAlive>
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 2rem;
}

.tabs {
  display: flex;
  gap: 0.25rem;
}

.tab {
  padding: 0.3rem 0.9rem;
  color: inherit;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }

  &.active {
    border-bottom-color: $accent-color;
    opacity: 1;
  }
}

.empty-state p {
  margin: 0 0 0.75rem;
}
</style>
