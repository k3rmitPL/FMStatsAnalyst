// Demo setup: sample metrics, a view and a dataset shipped in public/data, loaded in one go.

import { importCsvFile } from './csvImport'
import { getImports } from './db'

const DATA_URL = `${import.meta.env.BASE_URL}data/`

const DEMO_FILES = {
  metrics: 'metric-shots-indices.json',
  view: 'view-best-shooters.json',
  dataset: 'europe_end_of_2026-27.csv',
}

/** Downloads a file from public/data as a File, as if the user had picked it. */
async function fetchFile(name, type) {
  const response = await fetch(DATA_URL + encodeURIComponent(name))
  // A missing file comes back as the app's own page (status 200, HTML), so check the type too.
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(`Could not download ${name}.`)
  }
  return new File([await response.blob()], name, { type })
}

/**
 * Imports the demo metrics and view (replacing earlier copies of them) and the sample dataset
 * (reused when it was loaded before). `onProgress(percent, message)` reports each step.
 * Returns { importId, viewId } to open on the Analyze page.
 */
export async function loadDemo(library, onProgress = () => {}) {
  await library.load()

  onProgress(0, 'Loading metrics...')
  await library.importMetrics(await fetchFile(DEMO_FILES.metrics, 'application/json'))

  onProgress(0, 'Loading view...')
  const viewFile = await fetchFile(DEMO_FILES.view, 'application/json')
  const viewId = JSON.parse(await viewFile.text()).views?.[0]?.id ?? null
  await library.importViews(viewFile)

  const existing = (await getImports()).find(
    (i) => i.fileName === DEMO_FILES.dataset && i.rowCount > 0,
  )
  if (existing) return { importId: existing.id, viewId }

  onProgress(0, 'Downloading sample players...')
  const csv = await fetchFile(DEMO_FILES.dataset, 'text/csv')
  const { importId } = await importCsvFile(csv, onProgress)
  return { importId, viewId }
}
