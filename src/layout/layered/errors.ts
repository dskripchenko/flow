/**
 * Errors of the layered layout. Copied from @dskripchenko/diagrams
 * (src/core/errors.ts) together with the layout; the name stays so that a
 * later switch to the diagrams export changes nothing for callers.
 */
export class DiagramError extends Error {
  override readonly name = 'DiagramError'

  constructor(
    message: string,
    readonly line = 0,
    readonly column = 0,
    readonly hint?: string,
  ) {
    super(line > 0 ? `${message} (line ${line}${column > 0 ? `, column ${column}` : ''})` : message)
  }
}

/** Raised when a graph is too large to lay out in predictable time. */
export function tooLarge(what: string, count: number, limit: number): DiagramError {
  return new DiagramError(`The graph has ${count} ${what}; the limit is ${limit}.`, 0, 0, 'Split it into sub-processes.')
}
