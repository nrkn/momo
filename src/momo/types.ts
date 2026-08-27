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

// ---- fixed-point splits (DESIGN.md §25) -------------------------------------
//
// `i8.8` is an i16 with eight fraction bits. Nothing here returns a new
// ValueType: the split decides which of the five the type already IS, and the
// fraction width travels beside it. That is the rule doing the work - no new
// storage, no new codegen, and the sugar is type checking plus shift amounts.

// Null when the split is legal. Three ways to get it wrong want three answers,
// so this returns the message rather than a boolean.
export const fixedSplitError = (
  signed: boolean,
  whole: number,
  frac: number,
): string | null => {
  const letter = signed ? 'i' : 'u'
  const spelling = `${letter}${whole}.${frac}`
  const total = whole + frac

  // `i16.0` is i16, and two spellings for one type is worse than one.
  if (frac === 0) return `${spelling} is ${letter}${whole} - write that instead`

  // Twelve bits matches no storage width, so `i6.6` would live in sixteen and
  // the four spare bits would be a lie: the type would claim a range it does
  // not enforce, and overflow would wrap at sixteen rather than at twelve.
  if (total !== 8 && total !== 16) {
    const honest = frac < 16 ? ` - ${letter}${16 - frac}.${frac} lives in 16 bits and says so` : ''
    return `${spelling} is ${total} bits, which is not a storage width${honest}`
  }

  return null
}

// The storage a legal split lives in. Narrower than ValueType on purpose: these
// four are exactly the spellable types, so the result drops straight into a
// TypeName without a cast.
export const fixedStorage = (
  signed: boolean,
  total: number,
): 'u8' | 'i8' | 'u16' | 'i16' =>
  total === 8 ? (signed ? 'i8' : 'u8') : signed ? 'i16' : 'u16'

// 2^frac. The fraction width is at most 16, so this is exact.
export const scaleOf = (frac: number): number => 2 ** frac

// How a type and a scale are spelled in source. Error messages have to say
// "i8.8" where the source said it, not "i16" - the storage type is true and
// useless to the reader.
export const spell = (type: ValueType, frac: number): string =>
  frac === 0 ? type : `${isSigned(type) ? 'i' : 'u'}${widthOf(type) * 8 - frac}.${frac}`

// The most fractional digits a decimal literal may carry. Sixteen fraction bits
// is about five decimal digits of meaning, so nine is already generous - and the
// exact arithmetic below stays inside 2^53 only while it holds.
export const maxDecimalDigits = 9

// A decimal literal at a given scale, exactly, rounding to nearest with ties away
// from zero. `1.5` in 8.8 is 384; `0.1` is 25.6 and so becomes 26.
//
// Integer arithmetic throughout: (whole * 10^n + digits) * 2^frac / 10^n. Doing it
// in floating point would make the rounding rule a claim about the host's
// behaviour rather than about this function.
export const scaleDecimal = (whole: number, digits: string, frac: number): number => {
  const tenth = 10 ** digits.length
  const numerator = (whole * tenth + Number(digits)) * scaleOf(frac)
  return Math.floor((numerator + tenth / 2) / tenth)
}

// Value-preserving conversion between two scales: 1.5 in 8.8 is 384, and 384 back
// to a plain integer is 2 rather than 1. Scaling up is exact; scaling down rounds
// to nearest with ties away from zero, which is the rule DESIGN.md §25 settles on
// and the reason "exact" is a property of 1.5 rather than of the scheme.
export const rescale = (value: number, from: number, to: number): number => {
  if (to >= from) return value * scaleOf(to - from)

  const divisor = scaleOf(from - to)
  const magnitude = Math.abs(value)
  const rounded = Math.floor((magnitude + divisor / 2) / divisor)
  return value < 0 ? -rounded : rounded
}
