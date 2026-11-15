// Advanced import: several CSV exports merged into one dataset, matched on the Unique ID column.
//
// The first file is the main one; each file below overrides the values of the files above it
// (empty cells too). Files after the main one only add players when `addNew` is set.
// Custom columns (a new column or one of the CSVs' own) get a value per file: on the main file it's
// the default for every player, on another file it's set for that file's players. A file without a
// value for a custom column (removed from it) leaves that column alone.
//
// Source: { fileName, rows, fields, error, addNew, values: { [customColumnId]: string } }
// Custom column: { id, name, type: 'text' | 'number' }  (type only matters for new columns)

import { ID_COLUMN, duplicateIds, duplicateIdsMessage, idKey, parseCsv } from './csvImport'
import { NA, NOTES_COLUMN, detectColumn, transformDataset } from './transform'

// Same rule as Papa Parse's dynamic typing, so a typed value converts like a CSV value would.
const FLOAT_RE = /^\s*-?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/

/** Parses a CSV file for the advanced import. `error` is set when it can't be used. */
export async function readSourceFile(file) {
  const { rows, fields } = await parseCsv(file)
  return {
    fileName: file.name,
    rows,
    fields,
    error: sourceError(file.name, rows, fields),
    addNew: false,
    values: {},
  }
}

function sourceError(fileName, rows, fields) {
  if (!fields.some((field) => field?.trim())) return `${fileName} has no header row.`
  if (!fields.includes(ID_COLUMN)) {
    return `${fileName} has no "${ID_COLUMN}" column. Add it to the view in FM and export again.`
  }
  const empty = rows.filter((row) => idKey(row[ID_COLUMN]) == null).length
  if (empty) return `${fileName} has ${empty} row${empty === 1 ? '' : 's'} without a ${ID_COLUMN}.`
  const duplicates = duplicateIds(rows)
  if (duplicates.length) return duplicateIdsMessage(fileName, duplicates)
  return null
}

/** All CSV columns of the files, the main file's first. */
export function sourceColumns(sources) {
  const columns = new Set()
  for (const source of sources) for (const field of source.fields) columns.add(field)
  return [...columns]
}

/** A custom value typed like Papa Parse types CSV values. */
export function parseCustomValue(value) {
  if (value === 'true' || value === 'TRUE') return true
  if (value === 'false' || value === 'FALSE') return false
  if (FLOAT_RE.test(value)) return parseFloat(value)
  return value
}

/** Value stored for a new custom column. */
function newColumnValue(column, value) {
  if (value === '' || column.type !== 'number') return value
  return parseFloat(value)
}

/**
 * Rows, matched and added players per file, in import order. A file is matched against the players
 * of the files above it (the main file's, plus those other files added).
 */
export function sourceSummaries(sources) {
  const ids = new Set()
  const mainFields = sources[0]?.fields ?? []
  return sources.map((source, index) => {
    let matched = 0
    let added = 0
    for (const row of source.rows) {
      const key = idKey(row[ID_COLUMN])
      if (key == null) continue
      if (ids.has(key)) matched++
      else if (index === 0 || source.addNew) {
        ids.add(key)
        added++
      }
    }
    const missingColumns = index === 0 ? [] : mainFields.filter((f) => !source.fields.includes(f))
    return {
      rows: source.rows.length,
      matched,
      added,
      skipped: source.rows.length - matched - added,
      missingColumns,
    }
  })
}

function unitLabel(spec) {
  return spec.kind === 'feet' ? 'ft/in' : spec.unit
}

/**
 * Columns whose unit or currency differs between the files, as error messages. Units are detected
 * per file the same way a single import detects them.
 */
export function unitErrors(sources) {
  const errors = []
  for (const column of sourceColumns(sources)) {
    if (column === ID_COLUMN) continue
    const byUnit = new Map()
    for (const source of sources) {
      if (!source.fields.includes(column)) continue
      const spec = detectColumn(
        column,
        source.rows.map((row) => row[column]),
      )
      if (!spec?.unit) continue
      const unit = unitLabel(spec)
      if (!byUnit.has(unit)) byUnit.set(unit, [])
      byUnit.get(unit).push(source.fileName)
    }
    if (byUnit.size > 1) {
      const parts = [...byUnit].map(([unit, files]) => `${unit} in ${files.join(', ')}`)
      errors.push(`"${column}" uses different units: ${parts.join('; ')}.`)
    }
  }
  return errors
}

/** Problems with the custom column definitions and their values, as error messages. */
export function customColumnErrors(sources, customColumns) {
  const errors = []
  const csvColumns = new Set(sourceColumns(sources))
  const names = new Set()

  for (const column of customColumns) {
    const name = column.name
    if (!name) {
      errors.push('A custom column has no name.')
      continue
    }
    if (names.has(name)) errors.push(`"${name}" is added as a custom column more than once.`)
    names.add(name)
    if (name === ID_COLUMN) {
      errors.push(`"${ID_COLUMN}" matches players across files and can't be changed.`)
      continue
    }

    if (!csvColumns.has(name)) {
      if (name === NOTES_COLUMN) {
        errors.push(
          `"${NOTES_COLUMN}" is the column the app adds for your notes; choose another name.`,
        )
        continue
      }
      if (column.type !== 'number') continue
      for (const source of sources) {
        const value = source.values[column.id]
        if (value == null || value === '') continue
        if (typeof parseCustomValue(value) !== 'number') {
          errors.push(`${source.fileName}: "${value}" isn't a number (column "${name}").`)
        }
      }
      continue
    }

    // An existing column: a value must keep the format detected from the CSVs (unit, currency...).
    const csvValues = sources.flatMap((s) =>
      s.fields.includes(name) ? s.rows.map((row) => row[name]) : [],
    )
    const csvSpec = detectColumn(name, csvValues)
    if (!csvSpec) continue
    const sample = csvValues.find((v) => detectColumn(name, [v]))
    for (const source of sources) {
      const value = source.values[column.id]
      if (value == null || value === '') continue
      const spec = detectColumn(name, [...csvValues, parseCustomValue(value)])
      if (spec?.kind !== csvSpec.kind || spec?.unit !== csvSpec.unit) {
        errors.push(
          `${source.fileName}: "${value}" doesn't match the format of "${name}" (e.g. "${sample}").`,
        )
      }
    }
  }
  return errors
}

const EMPTIED = Symbol('emptied')
const NEW_VALUES = Symbol('newValues')

/**
 * Merges the files and converts the result like a single import does.
 * Returns { rows, columns, columnInfo, stats } for saveDataset().
 */
export function mergeSources(sources, customColumns) {
  const fields = sourceColumns(sources)
  const existing = customColumns.filter((c) => fields.includes(c.name))
  const added = customColumns.filter((c) => !fields.includes(c.name))

  // Players missing a column (it isn't in their files) get N/A; new custom columns start empty.
  const newRow = () => {
    const row = Object.fromEntries(fields.map((field) => [field, NA]))
    row[EMPTIED] = new Set()
    row[NEW_VALUES] = Object.fromEntries(added.map((c) => [c.name, '']))
    return row
  }
  const applyCsv = (row, source, csvRow) => {
    for (const field of source.fields) {
      row[field] = csvRow[field] ?? null
      row[EMPTIED].delete(field)
    }
  }
  // An empty custom value is kept as an empty string after the conversion (which would make it
  // N/A in a numerical column), so emptied cells are tracked.
  const applyCustom = (row, source) => {
    for (const column of existing) {
      if (!(column.id in source.values)) continue
      const value = source.values[column.id]
      row[column.name] = parseCustomValue(value)
      if (value === '') row[EMPTIED].add(column.name)
      else row[EMPTIED].delete(column.name)
    }
    for (const column of added) {
      if (column.id in source.values) {
        row[NEW_VALUES][column.name] = newColumnValue(column, source.values[column.id])
      }
    }
  }

  const [main, ...others] = sources
  const merged = []
  const byId = new Map()
  for (const csvRow of main.rows) {
    const row = newRow()
    applyCsv(row, main, csvRow)
    applyCustom(row, main)
    merged.push(row)
    byId.set(idKey(csvRow[ID_COLUMN]), row)
  }
  for (const source of others) {
    for (const csvRow of source.rows) {
      const key = idKey(csvRow[ID_COLUMN])
      let row = byId.get(key)
      if (!row) {
        if (!source.addNew) continue
        // A new player still gets the main file's custom values as defaults.
        row = newRow()
        applyCustom(row, main)
        merged.push(row)
        byId.set(key, row)
      }
      applyCsv(row, source, csvRow)
      applyCustom(row, source)
    }
  }

  const dataset = transformDataset(merged, fields)

  for (const column of added) {
    if (column.name in dataset.columnInfo) {
      throw new Error(
        `"${column.name}" is a column the app adds itself (from another column); choose another name.`,
      )
    }
  }
  dataset.rows.forEach((out, i) => {
    const row = merged[i]
    for (const name of row[EMPTIED]) out[name] = ''
    Object.assign(out, row[NEW_VALUES])
  })

  // New columns go before Notes when that's the last column.
  const insertAt =
    dataset.columns.at(-1) === NOTES_COLUMN ? dataset.columns.length - 1 : dataset.columns.length
  dataset.columns.splice(insertAt, 0, ...added.map((c) => c.name))
  for (const column of added) {
    const isNumber = column.type === 'number'
    dataset.columnInfo[column.name] = { type: isNumber ? 'number' : 'text' }
    if (!isNumber) continue
    let min = Infinity
    let max = -Infinity
    for (const row of dataset.rows) {
      const v = row[column.name]
      if (typeof v !== 'number' || Number.isNaN(v)) continue
      if (v < min) min = v
      if (v > max) max = v
    }
    if (min !== Infinity) dataset.stats[column.name] = { min, max }
  }
  return dataset
}
