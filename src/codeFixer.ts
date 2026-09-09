export type CodeFixResult = {
  code: string
  addedBraces: number
  addedFunctionCalls: number
  addedParentheses: number
  addedSemicolons: number
  normalizedOperators: number
  changedLines: number
}

type MaskState = {
  inBlockComment: boolean
}

type MaskedLine = {
  mask: string
  state: MaskState
  unterminatedQuote: boolean
}

const declarationStart = /^(?:(?:const|static|volatile|constexpr)\s+)*(?:(?:unsigned|signed)\s+)?(?:bool|byte|char|double|float|int|long|short|String|size_t|u?int(?:8|16|32|64)_t|Servo|CRGB|[A-Z][A-Za-z0-9_:<>]*)\b/
const functionDefinition = /^\s*(?:void|bool|byte|char|double|float|int|long|short|String|size_t|u?int(?:8|16|32|64)_t|[A-Z][A-Za-z0-9_:<>]*)[\s*&]+([A-Za-z_]\w*)\s*\(/
const controlStart = /^(?:else\s+)?(?:if|for|while|switch|catch)\s*\(/

function maskCodeLine(line: string, previous: MaskState): MaskedLine {
  const output = Array.from(line, () => ' ')
  let inBlockComment = previous.inBlockComment
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const next = line[index + 1]

    if (inBlockComment) {
      if (character === '*' && next === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      output[index] = 'x'
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '/' && next === '/') break
    if (character === '/' && next === '*') {
      inBlockComment = true
      index += 1
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      output[index] = 'x'
      continue
    }

    output[index] = character
  }

  return {
    mask: output.join(''),
    state: { inBlockComment },
    unterminatedQuote: quote !== null,
  }
}

function maskLines(lines: string[]) {
  let state: MaskState = { inBlockComment: false }
  return lines.map((line) => {
    const result = maskCodeLine(line, state)
    state = result.state
    return result
  })
}

function normalizeSplitOperators(lines: string[]) {
  const masked = maskLines(lines)
  let normalized = 0
  const output = lines.map((line, index) => {
    const matches = [...masked[index].mask.matchAll(/([<>=!])([ \t]+)=/g)].reverse()
    if (!matches.length) return line
    let result = line
    for (const match of matches) {
      const start = match.index!
      result = `${result.slice(0, start)}${match[1]}=${result.slice(start + match[0].length)}`
      normalized += 1
    }
    return result
  })
  return { lines: output, normalized }
}

function codeEnd(mask: string) {
  for (let index = mask.length - 1; index >= 0; index -= 1) {
    if (!/\s/.test(mask[index])) return index
  }
  return -1
}

function replaceCodeText(line: string, mask: string, replacement: string) {
  const end = codeEnd(mask)
  const suffix = end >= 0 ? line.slice(end + 1) : line
  const leading = line.match(/^\s*/)?.[0] || ''
  return `${leading}${replacement}${suffix}`
}

function unclosedDelimiters(mask: string) {
  const stack: Array<'(' | '['> = []
  for (const character of mask) {
    if (character === '(' || character === '[') {
      stack.push(character)
    } else if (character === ')' && stack.at(-1) === '(') {
      stack.pop()
    } else if (character === ']' && stack.at(-1) === '[') {
      stack.pop()
    }
  }
  return stack.reverse().map((character) => character === '(' ? ')' : ']').join('')
}

function completeLineDelimiters(line: string, masked: MaskedLine) {
  if (masked.unterminatedQuote) return { line, parentheses: 0 }
  const trimmedMask = masked.mask.trim()
  if (!trimmedMask || trimmedMask.startsWith('#')) return { line, parentheses: 0 }

  const end = codeEnd(masked.mask)
  if (end < 0) return { line, parentheses: 0 }
  const braceIndex = masked.mask.lastIndexOf('{')
  const target = braceIndex >= 0 && masked.mask.slice(braceIndex + 1).trim() === ''
    ? braceIndex
    : masked.mask[end] === ';' ? end : end + 1
  const prefixMask = masked.mask.slice(0, target)
  const closers = unclosedDelimiters(prefixMask)
  if (!closers) return { line, parentheses: 0 }

  const prefix = line.slice(0, target)
  const normalizedTail = prefix.trimEnd().replace(/(?:\+\+|--)$/, 'value')
  if (!normalizedTail || /[,([=+\-*/%&|!<>?:]$/.test(normalizedTail)) return { line, parentheses: 0 }

  const spacing = prefix.slice(prefix.trimEnd().length)
  const completed = `${prefix.trimEnd()}${closers}${spacing}${line.slice(target)}`
  return {
    line: completed,
    parentheses: Array.from(closers).filter((character) => character === ')').length,
  }
}

function completeHeaderPunctuation(line: string, mask: string) {
  const end = codeEnd(mask)
  if (end < 0) return { line, parentheses: 0 }
  const code = line.slice(0, end + 1).trim()

  const voidFunction = code.match(/^void\s+([A-Za-z_]\w*)\s*\{$/)
  if (voidFunction) {
    return { line: replaceCodeText(line, mask, `void ${voidFunction[1]}() {`), parentheses: 1 }
  }

  const partialVoidFunction = code.match(/^void\s+([A-Za-z_]\w*)\s*\(\s*\{$/)
  if (partialVoidFunction) {
    return { line: replaceCodeText(line, mask, `void ${partialVoidFunction[1]}() {`), parentheses: 1 }
  }

  const control = code.match(/^((?:else\s+)?(?:if|while|switch))\s+(.+?)\s*\{$/)
  if (control && !control[2].startsWith('(')) {
    return { line: replaceCodeText(line, mask, `${control[1]} (${control[2]}) {`), parentheses: 1 }
  }

  return { line, parentheses: 0 }
}

function collectFunctionNames(lines: string[]) {
  const names = new Set<string>()
  const masked = maskLines(lines)
  masked.forEach(({ mask }) => {
    const match = mask.match(functionDefinition)
    if (match && match[1] !== 'setup' && match[1] !== 'loop') names.add(match[1])
  })
  return names
}

function completeBareFunctionCall(line: string, mask: string, functionNames: Set<string>) {
  const end = codeEnd(mask)
  if (end < 0) return { line, changed: false }
  const code = line.slice(0, end + 1).trim()
  const match = code.match(/^([A-Za-z_]\w*);?$/)
  if (!match || !functionNames.has(match[1])) return { line, changed: false }
  return { line: replaceCodeText(line, mask, `${match[1]}();`), changed: true }
}

function nextCodeLine(masks: MaskedLine[], start: number) {
  for (let index = start + 1; index < masks.length; index += 1) {
    const next = masks[index].mask.trim()
    if (next) return next
  }
  return ''
}

function hasAssignment(code: string) {
  return /(?:^|[^=!<>])=(?!=)|\+=|-=|\*=|\/=|%=/.test(code)
}

function shouldAddSemicolon(code: string, next: string) {
  if (!code || code.startsWith('#') || /[;{,:\\]$/.test(code)) return false
  if (code === '}' || (/}$/.test(code) && !hasAssignment(code) && !/^(?:struct|class|enum)\b/.test(code))) return false
  if (controlStart.test(code) || /^(?:else|do|try)\b/.test(code)) return false
  if (/^(?:case\b.*|default)\s*:$/.test(code) || /^(?:public|private|protected)\s*:$/.test(code)) return false
  if (functionDefinition.test(code) && next.startsWith('{')) return false
  if (/^(?:return|break|continue|goto|throw)\b/.test(code)) return true
  if (/^(?:struct|class|enum)\b.*}$/.test(code)) return true
  if (declarationStart.test(code)) return true
  if (hasAssignment(code) || /(?:\+\+|--)$/.test(code)) return true
  return /(?:[A-Za-z_]\w*(?:\s*(?:::|\.|->)\s*[A-Za-z_]\w*)*)\s*\([^;{}]*\)$/.test(code)
}

function addMissingSemicolons(lines: string[]) {
  const masks = maskLines(lines)
  let added = 0
  let parenthesisDepth = 0
  let bracketDepth = 0
  const completed = lines.map((line, index) => {
    const insideContinuation = parenthesisDepth > 0 || bracketDepth > 0
    parenthesisDepth = Math.max(0, parenthesisDepth + Array.from(masks[index].mask).filter((character) => character === '(').length - Array.from(masks[index].mask).filter((character) => character === ')').length)
    bracketDepth = Math.max(0, bracketDepth + Array.from(masks[index].mask).filter((character) => character === '[').length - Array.from(masks[index].mask).filter((character) => character === ']').length)
    if (insideContinuation) return line
    const end = codeEnd(masks[index].mask)
    if (end < 0) return line
    const code = line.slice(0, end + 1).trim()
    if (!shouldAddSemicolon(code, nextCodeLine(masks, index))) return line
    added += 1
    return `${line.slice(0, end + 1)};${line.slice(end + 1)}`
  })
  return { lines: completed, added }
}

function addMissingClosingBraces(lines: string[]) {
  const masks = maskLines(lines)
  let balance = 0
  masks.forEach(({ mask }) => {
    if (mask.trimStart().startsWith('#')) return
    for (const character of mask) {
      if (character === '{') balance += 1
      if (character === '}') balance -= 1
    }
  })
  const missing = Math.max(0, balance)
  if (missing === 0) return { lines, added: 0 }
  const output = [...lines]
  if (output.at(-1)?.trim()) output.push('')
  for (let count = 0; count < missing; count += 1) output.push('}')
  return { lines: output, added: missing }
}

function formatIndentation(lines: string[]) {
  let state: MaskState = { inBlockComment: false }
  let indent = 0
  let parenthesisDepth = 0
  let bracketDepth = 0
  let activeCaseDepth: number | null = null

  return lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return ''
    const masked = maskCodeLine(line, state)
    state = masked.state
    const code = masked.mask.trim()
    if (code.startsWith('#')) return trimmed

    const leadingClosers = code.match(/^}+/)?.[0].length || 0
    let lineIndent = Math.max(0, indent - leadingClosers)
    const isCase = /^(?:case\b.*|default)\s*:$/.test(code)
    if (activeCaseDepth !== null && lineIndent < activeCaseDepth) activeCaseDepth = null
    if (activeCaseDepth !== null && !isCase && !code.startsWith('}') && lineIndent >= activeCaseDepth) lineIndent += 1
    if ((parenthesisDepth > 0 && !code.startsWith(')')) || (bracketDepth > 0 && !code.startsWith(']'))) lineIndent += 1

    const formatted = `${'  '.repeat(lineIndent)}${trimmed}`
    const opens = Array.from(masked.mask).filter((character) => character === '{').length
    const closes = Array.from(masked.mask).filter((character) => character === '}').length
    indent = Math.max(0, indent + opens - closes)
    parenthesisDepth = Math.max(0, parenthesisDepth + Array.from(masked.mask).filter((character) => character === '(').length - Array.from(masked.mask).filter((character) => character === ')').length)
    bracketDepth = Math.max(0, bracketDepth + Array.from(masked.mask).filter((character) => character === '[').length - Array.from(masked.mask).filter((character) => character === ']').length)
    if (isCase) activeCaseDepth = indent
    return formatted
  })
}

export function fixArduinoCode(source: string): CodeFixResult {
  const normalized = source.replace(/\r\n?/g, '\n')
  const keepFinalNewline = normalized.endsWith('\n')
  const originalLines = normalized.split('\n')
  let lines = [...originalLines]
  let addedParentheses = 0

  const operators = normalizeSplitOperators(lines)
  lines = operators.lines

  let masked = maskLines(lines)
  lines = lines.map((line, index) => {
    const result = completeHeaderPunctuation(line, masked[index].mask)
    addedParentheses += result.parentheses
    return result.line
  })

  masked = maskLines(lines)
  lines = lines.map((line, index) => {
    const result = completeLineDelimiters(line, masked[index])
    addedParentheses += result.parentheses
    return result.line
  })

  const functionNames = collectFunctionNames(lines)
  masked = maskLines(lines)
  let addedFunctionCalls = 0
  lines = lines.map((line, index) => {
    const result = completeBareFunctionCall(line, masked[index].mask, functionNames)
    if (result.changed) addedFunctionCalls += 1
    return result.line
  })

  const semicolons = addMissingSemicolons(lines)
  lines = semicolons.lines
  const braces = addMissingClosingBraces(lines)
  lines = formatIndentation(braces.lines)

  let code = lines.join('\n')
  if (keepFinalNewline && !code.endsWith('\n')) code += '\n'
  if (!keepFinalNewline) code = code.replace(/\n+$/, '')
  let unchangedLines = 0
  for (let index = 0; index < Math.min(originalLines.length, lines.length); index += 1) {
    if (originalLines[index] === lines[index]) unchangedLines += 1
  }
  const changedLines = Math.max(originalLines.length, lines.length) - unchangedLines

  return {
    code,
    addedBraces: braces.added,
    addedFunctionCalls,
    addedParentheses,
    addedSemicolons: semicolons.added,
    normalizedOperators: operators.normalized,
    changedLines,
  }
}
