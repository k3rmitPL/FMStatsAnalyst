import { createRouter, createWebHashHistory } from 'vue-router'

import HomePage from '@/pages/HomePage.vue'
import AnalysePage from '@/pages/AnalysePage.vue'
import TableTab from '@/pages/analyse/TableTab.vue'
import MetricsPage from '@/pages/MetricsPage.vue'
import ImportPage from '@/pages/ImportPage.vue'

const routes = [
  { path: '/', component: HomePage },
  {
    path: '/analyse',
    component: AnalysePage,
    children: [
      // Links to /analyse (with ?import= and ?view=) open the table.
      { path: '', redirect: (to) => ({ name: 'analyse-table', query: to.query }) },
      { path: 'table', name: 'analyse-table', component: TableTab },
      // Loaded when first opened: it brings in ECharts, which the rest of the app doesn't need.
      {
        path: 'charts',
        name: 'analyse-charts',
        component: () => import('@/pages/analyse/ChartsTab.vue'),
      },
    ],
  },
  { path: '/import', component: ImportPage },
  { path: '/metrics', component: MetricsPage },
]

// Hash URLs (/#/analyse): the server only ever serves index.html, so reloading or sharing any
// page works on static hosting such as GitHub Pages.
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: routes,
})

export default router
