import type { GlobOptions, GlobResult } from './types.ts'

const SLASH = '/'
const BACKSLASH = '\\'
const STAR = '*'
const QUESTION = '?'
const OPEN_SQUARE = '['
const CLOSE_SQUARE = ']'
const OPEN_CURLY = '{'
const CLOSE_CURLY = '}'
const OPEN_PAREN = '('
const CLOSE_PAREN = ')'
const CARET = '^'
const DOLLAR = '$'
const DOT = '.'
const PLUS = '+'
const BANG = '!'
const AT = '@'
const PIPE = '|'
const COMMA = ','
const COLON = ':'

const POSIX_CLASSES: Record<string, string> = {
  '[:alnum:]': '0-9A-Za-z',
  '[:alpha:]': 'A-Za-z',
  '[:ascii:]': '\\x00-\\x7F',
  '[:blank:]': ' \\t',
  '[:cntrl:]': '\\x00-\\x1F\\x7F',
  '[:digit:]': '0-9',
  '[:graph:]': '!-~',
  '[:lower:]': 'a-z',
  '[:print:]': ' -~',
  '[:punct:]': '!-@[-`{-~',
  '[:space:]': '\\s',
  '[:upper:]': 'A-Z',
  '[:word:]': '\\w',
  '[:xdigit:]': '0-9A-Fa-f',
}

const POSIX_LENGTH = 10
const GLOBSTAR = '((?:[^/]*(?:/|$))*)'
const WILDCARD = '([^/]*)'

export function globToRegex(
  glob: string,
  { extended = false, globstar = false, flags = '' }: GlobOptions = {},
): GlobResult {
  let regex = ''
  let inGroup = false
  let inRange = false

  const ext: string[] = []

  const add = (str: string, { split = false, last = false, only = '' } = {}): void => {
    if (only !== 'prefix') {
      if (split && regex.endsWith(SLASH)) {
        regex = regex.slice(0, -1)
      }
      regex += str
    }
    if (last && only !== 'suffix') {
      regex += `${ regex.endsWith(SLASH) ? '' : `${SLASH}?` }$`
    }
  }

  let i = 0
  while (i < glob.length) {
    const c = glob[i] ?? ''
    const n = glob[i + 1]
    const last = i === glob.length - 1

    switch (c) {
      case BACKSLASH:
      case DOLLAR:
      case CARET:
      case DOT:
      case OPEN_PAREN:
        add(BACKSLASH + c, { last })
        break

      case CLOSE_PAREN:
        add(c, { last })
        if (ext.length > 0) {
          const type = ext.pop() ?? ''
          if (type === BANG) {
            add(')[^/]*)$', { last })
          } else {
            add(type === AT ? '' : type, { last })
          }
        }
        break

      case PIPE:
        if (ext.length > 0) {
          add(c, { last })
          break
        }
        add(BACKSLASH + c, { last })
        break

      case PLUS:
        if (n === OPEN_PAREN && extended) {
          ext.push(c)
          break
        }
        add(BACKSLASH + c, { last })
        break

      case AT:
        if (n === OPEN_PAREN && extended) {
          ext.push(c)
          break
        }
        add(BACKSLASH + c, { last })
        break

      case BANG:
        if (extended) {
          if (inRange) {
            add(CARET, { last })
            break
          }
          if (n === OPEN_PAREN) {
            ext.push(c)
            add('(?!', { last })
            i++
            break
          }
          add(BACKSLASH + c, { last })
          break
        }
        add(BACKSLASH + c, { last })
        break

      case QUESTION:
        if (extended) {
          if (n === OPEN_PAREN) {
            ext.push(c)
          } else {
            add(DOT, { last })
          }
          break
        }
        add(BACKSLASH + c, { last })
        break

      case OPEN_SQUARE:
        if (inRange && n === COLON) {
          const k = glob.slice(i + 2, i + POSIX_LENGTH)
          const pClass = POSIX_CLASSES[`[:${k.slice(0, k.indexOf(':]') + 2)}`]
          if (pClass) {
            add(pClass, { last })
            i += k.indexOf(':]') + 3
          }
          break
        }
        if (extended) {
          inRange = true
          add(c, { last })
          break
        }
        add(BACKSLASH + c, { last })
        break

      case CLOSE_SQUARE:
        if (extended) {
          inRange = false
          add(c, { last })
          break
        }
        add(BACKSLASH + c, { last })
        break

      case OPEN_CURLY:
        if (extended) {
          inGroup = true
          add(OPEN_PAREN, { last })
          break
        }
        add(BACKSLASH + c, { last })
        break

      case CLOSE_CURLY:
        if (extended) {
          inGroup = false
          add(CLOSE_PAREN, { last })
          break
        }
        add(BACKSLASH + c, { last })
        break

      case COMMA:
        if (inGroup) {
          add(PIPE, { last })
          break
        }
        add(BACKSLASH + c, { last })
        break

      case STAR: {
        if (n === OPEN_PAREN && extended) {
          ext.push(c)
          break
        }

        const prevChar = glob[i - 1]
        let starCount = 1
        while (glob[i + 1] === STAR) {
          starCount++
          i++
        }
        const nextChar = glob[i + 1]
        const isGlobstar =
          globstar &&
          starCount > 1 &&
          (prevChar === SLASH || prevChar === undefined) &&
          (nextChar === SLASH || nextChar === undefined)

        if (isGlobstar) {
          add(GLOBSTAR, { last: nextChar === undefined, split: true })
          i++
        } else {
          add(WILDCARD, { last })
        }
        break
      }

      default:
        add(c, { last })
        break
    }

    i++
  }

  if (!flags.includes('g')) {
    regex = `^${regex}`
  }

  return { regex: new RegExp(regex, flags) }
}
