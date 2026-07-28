// Momo's type lattice.
//
// The mixing rule from DESIGN.md - "smallest type containing both value ranges,
// u16 does not mix with signed" - is implemented here as actual range
// arithmetic rather than as a hard-coded table. That is both self-documenting
// and provably the same thing: the two error cells fall out because no 16-bit
// type holds both a negative value and the top half of u16.

// 'untyped' is internal only. Literals and scalar consts carry it, and it
// adapts to whatever it is combined with - which is what makes the strict u16
// rule livable, since most mixing in real code is variable-against-literal.
export type ValueType = 'u8' | 'i8' | 'u16' | 'i16' | 'bool' | 'untyped'

export type Range = { min: number; max: number }

export const rangeOf = (type: ValueType): Range => {
  if (type === 'bool') return { min: 0, max: 1 }
  if (type === 'u8') return { min: 0, max: 255 }
  if (type === 'i8') return { min: -128, max: 127 }
  if (type === 'u16') return { min: 0, max: 65535 }
  return { min: -32768, max: 32767 }
}

export const isSigned = (type: ValueType): boolean => type === 'i8' || type === 'i16'

export const widthOf = (type: ValueType): number =>
  type === 'u16' || type === 'i16' ? 2 : 1

// All arithmetic happens in 16 bits, so the result is always u16 or i16.
// Returns null when no 16-bit type holds both ranges.
export const combineRanges = (a: Range, b: Range): ValueType | null => {
  const min = Math.min(a.min, b.min)
  const max = Math.max(a.max, b.max)

  if (min >= 0 && max <= 65535) return 'u16'
  if (min >= -32768 && max <= 32767) return 'i16'
  return null
}

// What an untyped constant becomes when nothing else forces its hand:
// smallest type that fits, signed if negative.
export const naturalType = (value: number): ValueType | null => {
  if (value >= 0 && value <= 255) return 'u8'
  if (value < 0 && value >= -128) return 'i8'
  if (value >= 0 && value <= 65535) return 'u16'
  if (value < 0 && value >= -32768) return 'i16'
  return null
}

// Promote to the 16-bit type used for computation.
export const promote = (type: ValueType): ValueType => {
  if (type === 'u8' || type === 'bool') return 'u16'
  if (type === 'i8') return 'i16'
  return type
}

export const truncate = (value: number, type: ValueType): number => {
  if (type === 'bool') return value === 0 ? 0 : 1

  const bits = widthOf(type) * 8
  const modulus = 1 << bits
  const masked = ((value % modulus) + modulus) % modulus

  if (!isSigned(type)) return masked

  const half = modulus / 2
  return masked >= half ? masked - modulus : masked
}

export const fits = (value: number, type: ValueType): boolean => {
  const range = rangeOf(type)
  return value >= range.min && value <= range.max
}
