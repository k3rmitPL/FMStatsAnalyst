// Small per-browser UI preferences kept in localStorage (e.g. page size, selected dataset).
// Storage can be unavailable (private mode, blocked site data), so every access is guarded and
// the app falls back to defaults.

import { ref, watch } from 'vue'

const PREFIX = 'fm-stats-analyst:'

export function readPreference(key, fallback, isValid = () => true) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    const value = JSON.parse(raw)
    return isValid(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function writePreference(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Not remembered; nothing else to do.
  }
}

/** A ref that starts from the stored value and saves every change. */
export function usePreference(key, fallback, isValid) {
  const value = ref(readPreference(key, fallback, isValid))
  watch(value, (v) => writePreference(key, v))
  return value
}
