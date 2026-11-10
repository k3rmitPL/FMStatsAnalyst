import { createRouter, createWebHashHistory } from 'vue-router'

import HomePage from '@/pages/HomePage.vue'
import AnalyzePage from '@/pages/AnalyzePage.vue'
import MetricsPage from '@/pages/MetricsPage.vue'

const routes = [
  { path: '/', component: HomePage },
  { path: '/analyze', component: AnalyzePage },
  { path: '/metrics', component: MetricsPage },
]

// Hash URLs (/#/analyze): the server only ever serves index.html, so reloading or sharing any
// page works on static hosting such as GitHub Pages.
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: routes,
})

export default router
