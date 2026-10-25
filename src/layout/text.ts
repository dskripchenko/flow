/**
 * Text sizes without a DOM. Layout must be deterministic and run in Node, so
 * the default measurer is a glyph-class table; a browser host may pass a
 * canvas measurer for a tighter fit (the Vue component does).
 */

export interface FontSpec {
  size: number
  weight?: number
}

export type TextMeasurer = (text: string, font: FontSpec) => number

const NARROW = new Set([...`il.,:;'|!()[]{}ftjrI1 `])
const WIDE = new Set([...'mwMW@%ЖШЩЮжшщю—'])

/** Width in em of one character, by class; tuned on system sans fonts. */
function glyph(ch: string): number {
  if (NARROW.has(ch)) return ch === ' ' ? 0.28 : 0.3
  if (WIDE.has(ch)) return 0.88
  const code = ch.codePointAt(0)!
  if (code >= 0x2e80) return 1 // CJK and wider
  if (ch >= '0' && ch <= '9') return 0.57
  if (ch !== ch.toLowerCase()) return 0.68 // capitals, Latin and Cyrillic
  if (code >= 0x0400 && code <= 0x04ff) return 0.58
  return 0.54
}

export const approximateMeasurer: TextMeasurer = (text, font) => {
  let em = 0
  for (const ch of text) em += glyph(ch)
  return em * font.size * ((font.weight ?? 400) >= 600 ? 1.06 : 1)
}

/**
 * Splits text into lines no wider than `max`, at spaces; a word longer than
 * a line is cut with an ellipsis. At most `maxLines` lines; the last one
 * ends with "…" when text is left over.
 */
export function wrapText(text: string, max: number, font: FontSpec, measure: TextMeasurer, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = ''
  let i = 0
  for (; i < words.length; i++) {
    const w = words[i]!
    const next = line ? `${line} ${w}` : w
    if (measure(next, font) <= max) {
      line = next
      continue
    }
    if (line) {
      lines.push(line)
      if (lines.length === maxLines) break
    }
    line = measure(w, font) <= max ? w : truncate(w, max, font, measure)
  }
  if (lines.length < maxLines && line) {
    lines.push(line)
    i = words.length
  }
  if (i < words.length) {
    const last = lines[lines.length - 1]!
    lines[lines.length - 1] = truncate(`${last}…`, max, font, measure, true)
  }
  return lines
}

function truncate(text: string, max: number, font: FontSpec, measure: TextMeasurer, hasEllipsis = false): string {
  let t = hasEllipsis ? text.slice(0, -1) : text
  while (t.length > 1 && measure(`${t}…`, font) > max) t = t.slice(0, -1)
  return measure(text, font) <= max && !hasEllipsis ? text : `${t.trimEnd()}…`
}
