// Thin promise wrapper around IndexedDB for storing imported CSV data.
//
// Schema:
//   imports: { id (auto), fileName, importedAt, rowCount, columns, columnInfo }
//   rows:    { id (auto), importId, data }  (index: importId)
//   stats:   { importId, columns: { [column]: { min, max } } }  (min/max of numerical columns)
//   config:  { key, items }  (user definitions: key 'metrics' or 'views')

const DB_NAME = 'fm_stats_analyst'
const DB_VERSION = 3

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('imports')) {
        db.createObjectStore('imports', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('rows')) {
        const rows = db.createObjectStore('rows', { keyPath: 'id', autoIncrement: true })
        rows.createIndex('importId', 'importId', { unique: false })
      }
      if (!db.objectStoreNames.contains('stats')) {
        db.createObjectStore('stats', { keyPath: 'importId' })
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      // Let a newer schema version (e.g. from another tab) upgrade the database.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })

  return dbPromise
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
  })
}

/** Creates an import record and returns its id. */
export async function createImport(fileName) {
  const db = await openDB()
  const tx = db.transaction('imports', 'readwrite')
  const id = await requestToPromise(
    tx.objectStore('imports').add({
      fileName,
      importedAt: new Date().toISOString(),
      rowCount: 0,
      columns: [],
      columnInfo: {},
    }),
  )
  await transactionDone(tx)
  return id
}

/** Merges fields into an existing import record. */
export async function updateImport(id, changes) {
  const db = await openDB()
  const tx = db.transaction('imports', 'readwrite')
  const store = tx.objectStore('imports')
  const current = await requestToPromise(store.get(id))
  if (current) store.put({ ...current, ...changes })
  await transactionDone(tx)
}

/** Appends a batch of parsed rows to an import in a single transaction. */
export async function addRows(importId, rows) {
  const db = await openDB()
  const tx = db.transaction('rows', 'readwrite')
  const store = tx.objectStore('rows')
  for (const data of rows) {
    store.add({ importId, data })
  }
  await transactionDone(tx)
}

/** Stores min/max values of numerical columns for an import. */
export async function saveStats(importId, columns) {
  const db = await openDB()
  const tx = db.transaction('stats', 'readwrite')
  tx.objectStore('stats').put({ importId, columns })
  await transactionDone(tx)
}

/** Returns { [column]: { min, max } } for an import (empty object if none stored). */
export async function getStats(importId) {
  const db = await openDB()
  const tx = db.transaction('stats', 'readonly')
  const record = await requestToPromise(tx.objectStore('stats').get(importId))
  return record?.columns ?? {}
}

/** Returns all imports, newest first. */
export async function getImports() {
  const db = await openDB()
  const tx = db.transaction('imports', 'readonly')
  const imports = await requestToPromise(tx.objectStore('imports').getAll())
  return imports.sort((a, b) => b.id - a.id)
}

/** Returns the row data objects for an import. */
export async function getRows(importId) {
  const db = await openDB()
  const tx = db.transaction('rows', 'readonly')
  const records = await requestToPromise(tx.objectStore('rows').index('importId').getAll(importId))
  return records.map((r) => r.data)
}

/** Deletes an import and all of its rows. */
export async function deleteImport(importId) {
  const db = await openDB()
  const tx = db.transaction(['imports', 'rows', 'stats'], 'readwrite')
  tx.objectStore('imports').delete(importId)
  tx.objectStore('stats').delete(importId)
  const index = tx.objectStore('rows').index('importId')
  const keys = await requestToPromise(index.getAllKeys(importId))
  const rows = tx.objectStore('rows')
  for (const key of keys) rows.delete(key)
  await transactionDone(tx)
}

/** Returns the stored list for a config key ('metrics', 'views'), or an empty list. */
export async function getConfig(key) {
  const db = await openDB()
  const tx = db.transaction('config', 'readonly')
  const record = await requestToPromise(tx.objectStore('config').get(key))
  return record?.items ?? []
}

/** Replaces the stored list for a config key. */
export async function saveConfig(key, items) {
  const db = await openDB()
  const tx = db.transaction('config', 'readwrite')
  // Plain copy: reactive proxies can't be stored by IndexedDB.
  tx.objectStore('config').put({ key, items: JSON.parse(JSON.stringify(items)) })
  await transactionDone(tx)
}
