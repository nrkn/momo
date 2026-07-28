// Errors in the user's Momo source, reported with a caret under the offending
// column. Compiler stages `raise()`; the tool layer catches and formats.
//
// A plain `throw` from a compiler stage means a bug in the compiler, not a
// problem with the user's program.

// Where something is, in a specific file. Every token and AST node carries one,
// so an error from an included file reports against that file's own lines.
export type Location = { file: string; line: number; col: number }

export type MomoError = Error & { momo: Location }

// The explicit type annotation on the const is load-bearing: TypeScript only
// narrows control flow after a never-returning call when the callee has one.
// Annotating just the arrow's return type is not enough.
type RaiseFn = (at: Location, message: string) => never

export const raise: RaiseFn = (at, message) => {
  const error = new Error(message) as MomoError
  error.momo = { file: at.file, line: at.line, col: at.col }
  throw error
}

export const isMomoError = (value: unknown): value is MomoError =>
  value instanceof Error && 'momo' in value

// `sources` maps file path -> text, so an error raised inside an included file
// is shown against that file's own lines rather than the entry file's.
export const formatError = (sources: Map<string, string>, error: MomoError): string => {
  const { file, line, col } = error.momo
  const sourceLines = (sources.get(file) ?? '').split('\n')
  const text = (sourceLines[line - 1] ?? '').replace(/\t/g, ' ').replace(/\r$/, '')
  const caret = ' '.repeat(Math.max(0, col - 1)) + '^'

  return [
    `${file}:${line}:${col}: error: ${error.message}`,
    '',
    `  ${text}`,
    `  ${caret}`,
  ].join('\n')
}
