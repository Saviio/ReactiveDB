
export interface ILexer {

}

export interface IParser {
  parse(): any
}

export interface ITokenizer {
  column: number
  lookahead: ITokenType
  keyWord(): void
  end(): boolean
  peek(): void
  skipWhitespace(): void
  skipNumber(): void
  scanString(): void
  scanWord(): void
  scanPunctuator(): void
  scan(): void
}

export interface ILocation {
  column: number
  line: number
}

export type TokenKind = 'EOF' | 'Punctuator' | 'Keyword' | 'Identifier' | 'Number' | 'string'

export interface ITokenType {
    type: TokenKind
    name?: string
}
