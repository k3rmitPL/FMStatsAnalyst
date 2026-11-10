// Imports a CSV export from Football Manager: parses it, converts the values (see transform.js)
// and stores it in IndexedDB as a new dataset.

import Papa from 'papaparse'

import { addRows, createImport, deleteImport, saveStats, updateImport } from './db'
import { transformDataset } from './transform'

const SAVE_BATCH_SIZE = 500

/**
 * Imports a CSV File and returns the new dataset's id.
 * `onProgress(percent, message)` is called while parsing and saving.
 */
export async function importCsvFile(file, onProgress = () => {}) {
  onProgress(0, 'Processing file...')
  const { rows: parsedRows, fields } = await parseCsv(file, onProgress)
  if (!fields.some((field) => field?.trim())) {
    throw new Error(`${file.name} has no columns. Choose a CSV file with a header row.`)
  }

  let importId
  try {
    onProgress(100, 'Converting values...')
    const { rows, columns, columnInfo, stats } = transformDataset(parsedRows, fields)

    importId = await createImport(file.name)
    for (let i = 0; i < rows.length; i += SAVE_BATCH_SIZE) {
      await addRows(importId, rows.slice(i, i + SAVE_BATCH_SIZE))
      const saved = Math.min(rows.length, i + SAVE_BATCH_SIZE)
      onProgress(
        Math.round((saved / rows.length) * 100),
        `Saved ${saved} of ${rows.length} rows...`,
      )
    }
    await saveStats(importId, stats)
    await updateImport(importId, { rowCount: rows.length, columns, columnInfo })
    return { importId, rowCount: rows.length }
  } catch (error) {
    // Don't leave a half-saved dataset behind.
    if (importId != null) await deleteImport(importId).catch(() => {})
    throw error
  }
}

// Column formats (units, currencies, dates) are detected from the whole file, so rows are
// collected first and transformed once parsing is complete.
// Parsing runs in chunks on the main thread. Papa Parse's `worker: true` starts a worker from its
// own script file, which doesn't exist once the app is bundled, so it fails in production builds.
function parseCsv(file, onProgress) {
  return new Promise((resolve, reject) => {
    const rows = []
    let fields = []
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: 'greedy',
      chunk(results) {
        if (!fields.length && results.meta.fields) fields = results.meta.fields
        for (const row of results.data) rows.push(row)
        const percent = file.size
          ? Math.min(100, Math.round((results.meta.cursor / file.size) * 100))
          : 100
        onProgress(percent, `Parsed ${rows.length} rows...`)
      },
      complete: () => resolve({ rows, fields }),
      error: reject,
    })
  })
}
