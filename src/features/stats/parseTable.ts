/**
 * Parses tabular text pasted from NFL.com (or any spreadsheet / web table):
 * tab-, comma- or multi-space-separated columns, one row per line. Pure so it
 * is easy to test; the importer UI lets the user pick the subject and value
 * columns from the result.
 */

export interface ParsedTable {
  header: string[]
  rows: string[][]
  /** Which separator was detected. */
  separator: 'tab' | 'comma' | 'spaces'
}

const NUMBER_RE = /^[-+]?\$?\d[\d,]*(\.\d+)?%?$/

export function parseTable(text: string): ParsedTable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trimEnd())
    .filter((l) => l.trim() !== '')
  if (lines.length === 0) return { header: [], rows: [], separator: 'tab' }

  const separator: ParsedTable['separator'] = lines.some((l) => l.includes('\t'))
    ? 'tab'
    : lines.every((l) => l.includes(','))
      ? 'comma'
      : 'spaces'
  const split = (line: string): string[] => {
    if (separator === 'tab') return line.split('\t').map((c) => c.trim())
    if (separator === 'comma') return splitCsvLine(line)
    return line
      .trim()
      .split(/\s{2,}/)
      .map((c) => c.trim())
  }

  const table = lines.map(split)
  const width = Math.max(...table.map((r) => r.length))
  const padded = table.map((r) => [
    ...r,
    ...new Array<string>(Math.max(0, width - r.length)).fill(''),
  ])

  // Header detection: first row has no numeric cells while the second does.
  const first = padded[0] ?? []
  const second = padded[1]
  const hasHeader =
    padded.length > 1 && !first.some(isNumeric) && Boolean(second && second.some(isNumeric))
  const header = hasHeader ? first : first.map((_, i) => `Column ${i + 1}`)
  const rows = hasHeader ? padded.slice(1) : padded
  return { header, rows, separator }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

export function isNumeric(cell: string): boolean {
  return NUMBER_RE.test(cell.trim())
}

/** "1,234.5" / "$12" / "45%" -> number, or null when not numeric. */
export function parseNumber(cell: string): number | null {
  const s = cell.trim()
  if (!isNumeric(s)) return null
  const n = Number(s.replace(/[$,%]/g, '').replace(/^\+/, ''))
  return Number.isFinite(n) ? n : null
}

/** Best guess for the subject (name) column: the first column with no numbers. */
export function guessSubjectColumn(table: ParsedTable): number {
  for (let c = 0; c < table.header.length; c++) {
    if (table.rows.every((r) => !isNumeric(r[c] ?? '') && (r[c] ?? '') !== '')) return c
  }
  return 0
}

/** Best guess for the value column: the first mostly-numeric column after the subject. */
export function guessValueColumn(table: ParsedTable, subjectColumn: number): number {
  for (let c = 0; c < table.header.length; c++) {
    if (c === subjectColumn) continue
    const numeric = table.rows.filter((r) => isNumeric(r[c] ?? '')).length
    if (numeric >= Math.max(1, table.rows.length / 2)) return c
  }
  return subjectColumn === 0 ? 1 : 0
}

export interface ImportRow {
  subject: string
  value: number
}

/** Rows ready to save; rows whose value is not numeric are reported separately. */
export function rowsForImport(
  table: ParsedTable,
  subjectColumn: number,
  valueColumn: number,
): { rows: ImportRow[]; skipped: string[] } {
  const rows: ImportRow[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  for (const r of table.rows) {
    const subject = (r[subjectColumn] ?? '').trim()
    const value = parseNumber(r[valueColumn] ?? '')
    if (!subject || value === null || seen.has(subject)) {
      if (subject) skipped.push(subject)
      continue
    }
    seen.add(subject)
    rows.push({ subject, value })
  }
  return { rows, skipped }
}
