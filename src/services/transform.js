// Normalises rows parsed from a Football Manager CSV export.
//
// Column formats are detected from the whole dataset, so a column is only converted when
// every non-empty value matches the same format (one unit, one currency, one wage period).
//
// Produces:
//   rows        transformed row objects
//   columns     column order, with derived columns placed after their source column
//   columnInfo  { [column]: { type: 'number' | 'date' | 'boolean' | 'text' | 'notes', unit?: string } }
//   stats       { [column]: { min, max } } for numerical columns

export const NA = 'N/A'

// Empty column added to every import for the user's own notes about a player.
export const NOTES_COLUMN = 'Notes'

// Values FM uses for "no value".
const PLACEHOLDERS = new Set(['', '-', 'N/A', 'n/a', 'Unknown', 'Not for Sale'])

const FOOT_LEVELS = ['Very Weak', 'Weak', 'Reasonable', 'Fairly Strong', 'Strong', 'Very Strong']
const FOOT_COLUMNS = {
  'Left Foot': 'Left Foot Proficiency',
  'Right Foot': 'Right Foot Proficiency',
}

// Money columns that are split into Min/Max columns (the original text column is kept).
const RANGE_COLUMNS = new Set(['Transfer Value', 'Wage'])

// Identifier columns that are numbers but not statistics.
const NO_STATS = new Set(['Unique ID'])

// Per-90 columns, calculated as total / Minutes * 90 and rounded to 2 decimals like FM does.
// A player with no minutes gets the total itself (0 tackles = 0 per 90).
const MINUTES_COLUMN = 'Minutes'

// FM's own per-90 columns, by the season total they come from. They are only calculated when an
// export lacks them (the values FM exports match this formula).
const FM_PER_90 = {
  Goals: 'Goals per 90 minutes',
  Assists: 'Asts/90',
  xG: 'xG/90',
  'NP-xG': 'NP-xG/90',
  xA: 'xA/90',
  xGP: 'xGP/90',
  Shots: 'Shot/90',
  ShT: 'ShT/90',
  Key: 'KP/90',
  CCC: 'Ch C/90',
  'Pas A': 'Ps A/90',
  'Ps C': 'Ps C/90',
  PsP: 'Pr passes/90',
  'Cr A': 'Crs A/90',
  'Cr C': 'Cr C/90',
  'OP-Crs A': 'OP-Crs A/90',
  'OP-Crs C': 'OP-Crs C/90',
  Drb: 'Drb/90',
  // FM's Tck/90 counts completed tackles, not attempts.
  'Tck C': 'Tck/90',
  'K Tck': 'K Tck/90',
  Itc: 'Int/90',
  // FM's Clr/90 includes goalkeepers' clearances, which the Clearances total leaves out, so a
  // calculated Clr/90 is 0 for goalkeepers.
  Clearances: 'Clr/90',
  Blk: 'Blk/90',
  'Shts Blckd': 'Shts Blckd/90',
  'Pres A': 'Pres A/90',
  'Pres C': 'Pres C/90',
  Hdrs: 'Hdrs W/90',
  'Hdrs A': 'Aer A/90',
  Distance: 'Dist/90',
  'Goals Conceded': 'Con/90',
  'Clean Sheets': 'Cln/90',
}

// Season totals FM has no per-90 column for; added as "<total>/90".
const EXTRA_PER_90 = [
  'Tck A',
  'Fouls',
  'Fouls Against',
  'Off',
  'MLG',
  'Yel',
  'Red',
  'Goals From Outside The Box',
  'Free Kick Shots',
  'Pens',
  'Pens S',
  'Svp',
  'Svh',
  'Svt',
  'xG-OP',
  'PoM',
]

// FM exports Saves/90 rounded down to a whole number, so it is always recalculated from the
// three kinds of saves.
const SAVE_COLUMNS = ['Svp', 'Svh', 'Svt']
const SAVES_PER_90 = 'Saves/90'

// Position column split into one true/false column per position, e.g. "D (RC), DM" → DR, DC, DM.
const POSITION_COLUMN = 'Position'
const POSITION_SIDES = {
  GK: [''],
  D: ['L', 'C', 'R'],
  WB: ['L', 'R'],
  DM: [''],
  M: ['L', 'C', 'R'],
  AM: ['L', 'C', 'R'],
  ST: ['L', 'C', 'R'],
}
const POSITION_COLUMNS = Object.entries(POSITION_SIDES).flatMap(([pos, sides]) =>
  sides.map((side) => pos + side),
)
// One group of a position string: "D/WB (RL)", "DM", "ST (C)"
const POSITION_GROUP_RE = /^([A-Z]+(?:\/[A-Z]+)*)\s*(?:\(([A-Z]+)\))?$/

/** Splits an FM position string into { GK: bool, DL: bool, ... }. */
function splitPositions(value) {
  const result = Object.fromEntries(POSITION_COLUMNS.map((col) => [col, false]))
  if (typeof value !== 'string') return result

  for (const group of value.split(',')) {
    const m = POSITION_GROUP_RE.exec(group.trim())
    if (!m) continue
    const groupSides = m[2] ?? ''
    // Roles sharing sides are written together: "D/WB (R)" = D (R) and WB (R).
    for (const pos of m[1].split('/')) {
      const sides = POSITION_SIDES[pos]
      if (!sides) continue
      for (const side of sides) {
        if (side === '' || groupSides.includes(side)) result[pos + side] = true
      }
    }
  }
  return result
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
// "175 cm", "1.82 m", "189.5km", "45%"
const UNIT_RE = /^(-?\d+(?:\.\d+)?)\s*(%|[a-zA-Z]{1,3})$/
// 5'11" or 5' 11
const FEET_RE = /^(\d+)'\s*(\d{1,2})(?:"|'')?$/
// "24 (1)" — appearances as starts (sub appearances)
const APPS_RE = /^(\d+)\s*\((\d+)\)$/
// "€1.5K", "$300", "CHF 2M", "R$10K"
const MONEY = String.raw`([A-Za-z]{0,3}\p{Sc}|[A-Z]{3}\s)(\d+(?:\.\d+)?)([KMB])?`
const MONEY_RE = new RegExp(`^${MONEY}$`, 'u')
// "€0 - €30K", "€6.5K - €8K p/m", "€6.5K p/m"
const MONEY_RANGE_RE = new RegExp(`^${MONEY}(?:\\s*-\\s*${MONEY})?(?:\\s+(p/[a-z]+))?$`, 'u')

// "11-16", "11 - 16", "6.5–7.2": a value only known as a range, e.g. an attribute the scouts
// haven't fully assessed. Split into "<column> Min" and "<column> Max".
const NUMBER_RANGE_RE = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/

const MULTIPLIERS = { K: 1e3, M: 1e6, B: 1e9 }

function isEmpty(value) {
  return value == null || (typeof value === 'string' && PLACEHOLDERS.has(value.trim()))
}

function moneyValue(amount, suffix) {
  return Math.round(parseFloat(amount) * (MULTIPLIERS[suffix] ?? 1))
}

function parseDate(value) {
  const m = DATE_RE.exec(value)
  // Noon UTC avoids the date shifting a day when shown in another timezone.
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12))
}

/**
 * Detects how a column should be converted. Returns null when it stays as text.
 * Every non-empty value must match the same format.
 */
function detectColumn(name, values) {
  const present = values.filter((v) => !isEmpty(v))
  if (!present.length) return null

  if (name in FOOT_COLUMNS) return { kind: 'foot' }

  const strings = present.filter((v) => typeof v === 'string').map((v) => v.trim())
  if (!strings.length) {
    return present.every((v) => typeof v === 'number') ? { kind: 'number' } : null
  }
  // From here on, mixing in values the parser already typed as numbers means mixed formats.
  const allStrings = strings.length === present.length

  if (allStrings && strings.every((v) => DATE_RE.test(v))) return { kind: 'date' }

  if (allStrings && strings.every((v) => FEET_RE.test(v))) return { kind: 'feet', unit: 'in' }

  if (strings.every((v) => APPS_RE.test(v))) return { kind: 'apps' }

  // Ranges, possibly mixed with exact values ("11-16", 14): the parser has already typed the
  // exact ones as numbers.
  if (
    strings.every((v) => NUMBER_RANGE_RE.test(v)) &&
    present.every((v) => typeof v === 'string' || typeof v === 'number')
  ) {
    return { kind: 'numberRange' }
  }

  if (allStrings) {
    const units = strings.map((v) => UNIT_RE.exec(v)?.[2])
    if (units.every((u) => u && u === units[0])) return { kind: 'unit', unit: units[0] }
  }

  if (allStrings && strings.every((v) => MONEY_RANGE_RE.test(v))) {
    const parts = strings.map((v) => MONEY_RANGE_RE.exec(v))
    const currencies = new Set(
      parts.flatMap((m) => [m[1], m[4]].filter(Boolean).map((c) => c.trim())),
    )
    const periods = new Set(parts.map((m) => m[7] ?? ''))
    if (currencies.size !== 1 || periods.size !== 1) return null

    const unit = [...currencies][0] + (parts[0][7] ? ` ${parts[0][7]}` : '')
    const isRange = RANGE_COLUMNS.has(name) || parts.some((m) => m[4])
    if (isRange) return { kind: 'moneyRange', unit }
    if (strings.every((v) => MONEY_RE.test(v))) return { kind: 'money', unit }
  }

  return null
}

/** Converts a single value according to the detected column format. */
function convert(spec, value) {
  if (isEmpty(value)) return NA
  if (typeof value === 'number') return value
  const v = value.trim()

  switch (spec.kind) {
    case 'date':
      return parseDate(v)
    case 'unit':
      return parseFloat(UNIT_RE.exec(v)[1])
    case 'feet': {
      const m = FEET_RE.exec(v)
      return +m[1] * 12 + +m[2]
    }
    case 'apps': {
      const m = APPS_RE.exec(v)
      return +m[1] + +m[2]
    }
    case 'money': {
      const m = MONEY_RE.exec(v)
      return moneyValue(m[2], m[3])
    }
    default:
      return value
  }
}

/** A season total per 90 minutes; with no minutes played, the total itself. */
function per90(total, minutes) {
  if (typeof total !== 'number' || typeof minutes !== 'number') return NA
  if (minutes <= 0) return total
  return Math.round((total / minutes) * 90 * 100) / 100
}

/**
 * Adds the per-90 columns (see FM_PER_90, EXTRA_PER_90 and SAVES_PER_90) to transformed rows.
 * New columns go right after their total; columns FM already exported are left as they are,
 * except Saves/90, which is replaced with the precise value.
 */
function addPer90Columns(rows, columns, columnInfo) {
  const isNumber = (col) => columnInfo[col]?.type === 'number'
  // Without a numeric Minutes column nothing is added or recalculated, Saves/90 included: the
  // export's own per-90 columns stay as they are.
  if (!isNumber(MINUTES_COLUMN)) return

  const insertAfter = (source, col) => {
    columns.splice(columns.indexOf(source) + 1, 0, col)
    columnInfo[col] = { type: 'number' }
  }

  const pairs = [
    ...Object.entries(FM_PER_90),
    ...EXTRA_PER_90.map((total) => [total, `${total}/90`]),
  ]
  for (const [total, col] of pairs) {
    if (!isNumber(total) || col in columnInfo) continue
    insertAfter(total, col)
    for (const row of rows) row[col] = per90(row[total], row[MINUTES_COLUMN])
  }

  if (SAVE_COLUMNS.every(isNumber)) {
    if (!(SAVES_PER_90 in columnInfo)) insertAfter(SAVE_COLUMNS.at(-1), SAVES_PER_90)
    columnInfo[SAVES_PER_90] = { type: 'number' }
    for (const row of rows) {
      const saves = SAVE_COLUMNS.map((col) => row[col])
      const total = saves.every((v) => typeof v === 'number') ? saves.reduce((a, b) => a + b) : NA
      row[SAVES_PER_90] = per90(total, row[MINUTES_COLUMN])
    }
  }
}

/** Transforms all rows and returns them with column metadata and min/max statistics. */
export function transformDataset(rows, fields) {
  const columns = []
  const columnInfo = {}
  // Per column: function(row, out) writing the converted value(s) into `out`.
  const writers = []

  // A column the CSV has itself is never replaced by one derived from another column (e.g. a
  // "DC" column next to Position, or "Wage Min" next to Wage): the derived one is skipped.
  const taken = new Set(fields)
  const derived = (col) => {
    if (taken.has(col)) return null
    taken.add(col)
    return col
  }
  const set = (out, col, value) => {
    if (col) out[col] = value
  }

  for (const field of fields) {
    if (field === POSITION_COLUMN) {
      const positionCols = POSITION_COLUMNS.filter(derived)
      columns.push(field, ...positionCols)
      columnInfo[field] = { type: 'text' }
      for (const col of positionCols) columnInfo[col] = { type: 'boolean' }
      writers.push((row, out) => {
        out[field] = row[field]
        const split = splitPositions(row[field])
        for (const col of positionCols) out[col] = split[col]
      })
      continue
    }

    const spec = detectColumn(
      field,
      rows.map((r) => r[field]),
    )

    if (!spec) {
      columns.push(field)
      columnInfo[field] = { type: 'text' }
      writers.push((row, out) => {
        out[field] = row[field]
      })
      continue
    }

    switch (spec.kind) {
      case 'foot': {
        const levelCol = derived(FOOT_COLUMNS[field])
        columns.push(field)
        columnInfo[field] = { type: 'text' }
        if (levelCol) {
          columns.push(levelCol)
          columnInfo[levelCol] = { type: 'number' }
        }
        writers.push((row, out) => {
          const value = row[field]
          const level = typeof value === 'string' ? FOOT_LEVELS.indexOf(value.trim()) : -1
          out[field] = value
          set(out, levelCol, level === -1 ? NA : level)
        })
        break
      }

      case 'numberRange': {
        // The original column keeps the text ("11-16"); an exact value is both Min and Max.
        const minCol = derived(`${field} Min`)
        const maxCol = derived(`${field} Max`)
        columns.push(field, ...[minCol, maxCol].filter(Boolean))
        columnInfo[field] = { type: 'text' }
        if (minCol) columnInfo[minCol] = { type: 'number' }
        if (maxCol) columnInfo[maxCol] = { type: 'number' }
        writers.push((row, out) => {
          const value = row[field]
          out[field] = value
          if (typeof value === 'number') {
            set(out, minCol, value)
            set(out, maxCol, value)
            return
          }
          const m = typeof value === 'string' ? NUMBER_RANGE_RE.exec(value.trim()) : null
          if (!m) {
            set(out, minCol, NA)
            set(out, maxCol, NA)
            return
          }
          const [a, b] = [parseFloat(m[1]), parseFloat(m[2])]
          set(out, minCol, Math.min(a, b))
          set(out, maxCol, Math.max(a, b))
        })
        break
      }

      case 'moneyRange': {
        const minCol = derived(`${field} Min`)
        const maxCol = derived(`${field} Max`)
        columns.push(field, ...[minCol, maxCol].filter(Boolean))
        columnInfo[field] = { type: 'text' }
        if (minCol) columnInfo[minCol] = { type: 'number', unit: spec.unit }
        if (maxCol) columnInfo[maxCol] = { type: 'number', unit: spec.unit }
        writers.push((row, out) => {
          const value = row[field]
          out[field] = value
          const m = typeof value === 'string' ? MONEY_RANGE_RE.exec(value.trim()) : null
          if (!m) {
            set(out, minCol, NA)
            set(out, maxCol, NA)
            return
          }
          const min = moneyValue(m[2], m[3])
          set(out, minCol, min)
          set(out, maxCol, m[4] ? moneyValue(m[5], m[6]) : min)
        })
        break
      }

      case 'apps': {
        // "24 (1)" = 24 starts + 1 as substitute; Apps becomes the total.
        const benchCol = derived('From Bench')
        columns.push(field)
        columnInfo[field] = { type: 'number' }
        if (benchCol) {
          columns.push(benchCol)
          columnInfo[benchCol] = { type: 'number' }
        }
        writers.push((row, out) => {
          const value = row[field]
          out[field] = convert(spec, value)
          const m = typeof value === 'string' ? APPS_RE.exec(value.trim()) : null
          set(out, benchCol, m ? +m[2] : out[field] === NA ? NA : 0)
        })
        break
      }

      default:
        columns.push(field)
        columnInfo[field] = spec.kind === 'date' ? { type: 'date' } : { type: 'number' }
        if (spec.unit) columnInfo[field].unit = spec.unit
        writers.push((row, out) => {
          out[field] = convert(spec, row[field])
        })
    }
  }

  const transformed = rows.map((row) => {
    const out = {}
    for (const write of writers) write(row, out)
    return out
  })

  addPer90Columns(transformed, columns, columnInfo)

  // Unless the CSV has a column of that name already.
  if (!(NOTES_COLUMN in columnInfo)) {
    columns.push(NOTES_COLUMN)
    columnInfo[NOTES_COLUMN] = { type: 'notes' }
    for (const row of transformed) row[NOTES_COLUMN] = ''
  }

  const stats = {}
  for (const col of columns) {
    if (columnInfo[col].type !== 'number' || NO_STATS.has(col)) continue
    let min = Infinity
    let max = -Infinity
    for (const row of transformed) {
      const v = row[col]
      if (typeof v !== 'number' || Number.isNaN(v)) continue
      if (v < min) min = v
      if (v > max) max = v
    }
    if (min !== Infinity) stats[col] = { min, max }
  }

  // Column names are unique (e.g. duplicate CSV headers); lists and tables are keyed by them.
  return { rows: transformed, columns: [...new Set(columns)], columnInfo, stats }
}
