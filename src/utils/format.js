// Displaying cell values: the same formatting in the table, the player lookup and the charts.

import { NA } from '@/services/transform'

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

/** True for values that mean "no value": null, '' and N/A. */
export function isEmpty(value) {
  return value == null || value === '' || value === NA
}

/** A cell value as shown in the table. */
export function formatCell(value) {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? '✓' : ''
  if (value instanceof Date) return dateFormat.format(value)
  if (typeof value === 'number') return numberFormat.format(value)
  return String(value)
}
