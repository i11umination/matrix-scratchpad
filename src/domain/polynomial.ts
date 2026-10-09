import {
  add as addRational,
  divide as divideRational,
  equal as equalRational,
  formatRational,
  isZero as isZeroRational,
  multiply as multiplyRational,
  negate as negateRational,
  parseRational,
  rational,
  type Rational,
} from './fraction'

// Each key is a sorted sequence of single-character variables: "xxy" means x²y.
export interface Polynomial {
  readonly terms: Record<string, Rational>
}

const MAX_TERMS = 500
const MAX_EXPONENT = 20
const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
}
const TO_SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

function makePolynomial(entries: Iterable<[string, Rational]>): Polynomial {
  const terms: Record<string, Rational> = Object.create(null)
  for (const [key, value] of entries) {
    if (!isZeroRational(value)) terms[key] = value
  }
  if (Object.keys(terms).length > MAX_TERMS) throw new Error('表达式项数过多，请拆成较小的步骤。')
  return { terms }
}

export function constant(value: Rational): Polynomial {
  return makePolynomial([['', value]])
}

export function zero(): Polynomial {
  return constant(rational(0n))
}

export function clonePolynomial(value: Polynomial): Polynomial {
  return makePolynomial(Object.entries(value.terms).map(([key, coefficient]) => [key, { ...coefficient }]))
}

export function isZeroPolynomial(value: Polynomial): boolean {
  return Object.keys(value.terms).length === 0
}

export function equalPolynomial(left: Polynomial, right: Polynomial): boolean {
  const keys = Object.keys(left.terms)
  return keys.length === Object.keys(right.terms).length &&
    keys.every((key) => right.terms[key] !== undefined && equalRational(left.terms[key], right.terms[key]))
}

export function addPolynomial(left: Polynomial, right: Polynomial): Polynomial {
  const terms: Record<string, Rational> = Object.assign(Object.create(null), left.terms)
  for (const [key, value] of Object.entries(right.terms)) {
    terms[key] = terms[key] ? addRational(terms[key], value) : value
  }
  return makePolynomial(Object.entries(terms))
}

export function scalePolynomial(value: Polynomial, coefficient: Rational): Polynomial {
  return makePolynomial(Object.entries(value.terms).map(([key, term]) =>
    [key, multiplyRational(term, coefficient)],
  ))
}

export function multiplyPolynomial(left: Polynomial, right: Polynomial): Polynomial {
  const terms: Record<string, Rational> = Object.create(null)
  for (const [leftKey, leftValue] of Object.entries(left.terms)) {
    for (const [rightKey, rightValue] of Object.entries(right.terms)) {
      const key = [...leftKey, ...rightKey].sort().join('')
      const product = multiplyRational(leftValue, rightValue)
      terms[key] = terms[key] ? addRational(terms[key], product) : product
    }
  }
  return makePolynomial(Object.entries(terms))
}

function power(value: Polynomial, exponent: number): Polynomial {
  let result = constant(rational(1n))
  let base = value
  let remaining = exponent
  while (remaining > 0) {
    if (remaining % 2 === 1) result = multiplyPolynomial(result, base)
    remaining = Math.floor(remaining / 2)
    if (remaining) base = multiplyPolynomial(base, base)
  }
  return result
}

function monomialText(key: string): string {
  let text = ''
  const variables = [...key]
  for (let index = 0; index < variables.length;) {
    const variable = variables[index]
    let end = index + 1
    while (variables[end] === variable) end += 1
    const exponent = end - index
    text += variable + (exponent === 1 ? '' : String(exponent).replace(/\d/g, (digit) => TO_SUPERSCRIPT[Number(digit)]))
    index = end
  }
  return text
}

export function formatPolynomial(value: Polynomial): string {
  const keys = Object.keys(value.terms).sort((left, right) => [...right].length - [...left].length || left.localeCompare(right))
  if (!keys.length) return '0'
  return keys.map((key, index) => {
    const coefficient = value.terms[key]
    const negative = coefficient.numerator < 0n
    const magnitude = negative ? negateRational(coefficient) : coefficient
    const prefix = index === 0 ? (negative ? '-' : '') : (negative ? ' - ' : ' + ')
    const coefficientText = key && equalRational(magnitude, rational(1n)) ? '' : formatRational(magnitude)
    return `${prefix}${coefficientText}${monomialText(key)}`
  }).join('')
}

type Token = { kind: 'number' | 'variable' | '+' | '-' | '*' | '/' | '^' | '(' | ')' | 'end'; text: string }

function tokenize(input: string): Token[] {
  const normalized = input.trim()
    .replace(/([\p{L})])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/gu, (_, base: string, digits: string) =>
      `${base}^${[...digits].map((digit) => SUPERSCRIPTS[digit]).join('')}`,
    )
    .replace(/−/g, '-')
    .replace(/[×·]/g, '*')
  if (!normalized) throw new Error('请输入数字或含未知数的表达式。')
  if (normalized.length > 120) throw new Error('表达式过长，请控制在 120 个字符以内。')

  const tokens: Token[] = []
  for (let index = 0; index < normalized.length;) {
    const rest = normalized.slice(index)
    if (/^\s/.test(rest)) { index += 1; continue }
    const number = rest.match(/^\d+(?:\.\d+)?/)
    if (number) {
      tokens.push({ kind: 'number', text: number[0] })
      index += number[0].length
      continue
    }
    const variable = rest.match(/^\p{L}/u)
    if (variable) {
      tokens.push({ kind: 'variable', text: variable[0] })
      index += variable[0].length
      continue
    }
    const character = rest[0]
    if ('+-*/^()'.includes(character)) {
      tokens.push({ kind: character as Token['kind'], text: character })
      index += 1
      continue
    }
    throw new Error(`无法识别“${character}”，请使用数字、字母和 + − × ÷ 运算。`)
  }
  tokens.push({ kind: 'end', text: '' })
  return tokens
}

export function parsePolynomial(input: string): Polynomial {
  const tokens = tokenize(input)
  let position = 0
  const peek = () => tokens[position]
  const take = () => tokens[position++]

  function primary(): Polynomial {
    const token = take()
    if (token.kind === 'number') return constant(parseRational(token.text))
    if (token.kind === 'variable') return makePolynomial([[token.text, rational(1n)]])
    if (token.kind === '(') {
      const result = sum()
      if (take().kind !== ')') throw new Error('括号未配对，请检查表达式。')
      return result
    }
    throw new Error('表达式不完整，请检查运算符和括号。')
  }

  function powered(): Polynomial {
    const base = primary()
    if (peek().kind !== '^') return base
    take()
    const exponent = take()
    if (exponent.kind !== 'number' || !/^\d+$/.test(exponent.text)) {
      throw new Error('指数必须是非负整数。')
    }
    const count = Number(exponent.text)
    if (count > MAX_EXPONENT) throw new Error(`指数最多支持 ${MAX_EXPONENT}。`)
    return power(base, count)
  }

  function signed(): Polynomial {
    if (peek().kind === '+') { take(); return signed() }
    if (peek().kind === '-') { take(); return scalePolynomial(signed(), rational(-1n)) }
    return powered()
  }

  function product(): Polynomial {
    let result = signed()
    while (true) {
      const next = peek().kind
      if (next === '*' || next === '/') {
        take()
        const right = signed()
        if (next === '*') result = multiplyPolynomial(result, right)
        else {
          if (isZeroPolynomial(right)) throw new Error('不能除以 0。')
          const divisor = right.terms['']
          if (Object.keys(right.terms).length !== 1 || !divisor) {
            throw new Error('目前只能除以非零数字，不能除以含未知数的表达式。')
          }
          result = scalePolynomial(result, divideRational(rational(1n), divisor))
        }
      } else if (next === 'number' || next === 'variable' || next === '(') {
        result = multiplyPolynomial(result, signed())
      } else break
    }
    return result
  }

  function sum(): Polynomial {
    let result = product()
    while (peek().kind === '+' || peek().kind === '-') {
      const operator = take().kind
      const right = product()
      result = addPolynomial(result, operator === '-' ? scalePolynomial(right, rational(-1n)) : right)
    }
    return result
  }

  const result = sum()
  if (peek().kind !== 'end') throw new Error('表达式格式不正确，请检查运算符和括号。')
  return result
}
