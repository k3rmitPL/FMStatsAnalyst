import { createRouter, createWebHashHistory } from 'vue-router'

import HomePage from '@/pages/HomePage.vue'
import AnalysePage from '@/pages/AnalysePage.vue'
import MetricsPage from '@/pages/MetricsPage.vue'

const routes = [
  { path: '/', component: HomePage },
  { path: '/analyse', component: AnalysePage },
  { path: '/metrics', component: MetricsPage },
]

// Hash URLs (/#/analyse): the server only ever serves index.html, so reloading or sharing any
// page works on static hosting such as GitHub Pages.
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: routes,
})

export default router
