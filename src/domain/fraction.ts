export interface Rational {
  readonly numerator: bigint
  readonly denominator: bigint
}

const absolute = (value: bigint) => (value < 0n ? -value : value)

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = absolute(left)
  let b = absolute(right)

  while (b !== 0n) {
    ;[a, b] = [b, a % b]
  }

  return a || 1n
}

export function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error('分母不能为 0。')

  const sign = denominator < 0n ? -1n : 1n
  const divisor = greatestCommonDivisor(numerator, denominator)

  return {
    numerator: (numerator / divisor) * sign,
    denominator: absolute(denominator) / divisor,
  }
}

export const ZERO = rational(0n)
export const ONE = rational(1n)

export function parseRational(input: string): Rational {
  const value = input.trim()
  if (!value) throw new Error('请输入整数、小数或分数。')

  const fraction = value.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/)
  if (fraction) {
    const denominator = BigInt(fraction[2])
    if (denominator === 0n) throw new Error('分母不能为 0。')
    return rational(BigInt(fraction[1]), denominator)
  }

  const decimal = value.match(/^([+-]?)(\d+)(?:\.(\d+))?$/)
  if (!decimal) throw new Error('格式不正确，请输入整数、小数或 a/b 形式的分数。')

  const sign = decimal[1] === '-' ? -1n : 1n
  const decimals = decimal[3] ?? ''
  const denominator = 10n ** BigInt(decimals.length)
  const whole = BigInt(decimal[2])
  const fractional = decimals ? BigInt(decimals) : 0n

  return rational(sign * (whole * denominator + fractional), denominator)
}

export function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  )
}

export function multiply(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  )
}

export function divide(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) throw new Error('不能除以 0。')
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  )
}

export function negate(value: Rational): Rational {
  return rational(-value.numerator, value.denominator)
}

export function isZero(value: Rational): boolean {
  return value.numerator === 0n
}

export function equal(left: Rational, right: Rational): boolean {
  return (
    left.numerator === right.numerator &&
    left.denominator === right.denominator
  )
}

export function formatRational(value: Rational): string {
  return value.denominator === 1n
    ? value.numerator.toString()
    : `${value.numerator}/${value.denominator}`
}
