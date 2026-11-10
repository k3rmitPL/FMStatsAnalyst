// Saving and opening JSON files entirely in the browser (no backend needed).

/** Downloads `data` as a pretty-printed JSON file. */
export function downloadJson(fileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Reads a File chosen by the user and parses it as JSON. */
export async function readJsonFile(file) {
  const text = await file.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${file.name} is not a valid JSON file.`)
  }
}

/** Lets the user pick a file without a visible <input type="file">. */
export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => resolve(input.files[0] ?? null))
    input.click()
  })
}

/** A safe file name based on an item name, e.g. "GK Score" → "gk-score.json". */
export function jsonFileName(name, fallback = 'export') {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || fallback}.json`
}
