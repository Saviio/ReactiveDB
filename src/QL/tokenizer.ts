import { ITokenizer, ITokenType } from './interface'


const reserved = {
  EOF: { type: 'EOF', name: 'end' },
}

export class Tokenizer implements ITokenizer {

  static Error() {
    return new SyntaxError()
  }

  static Illegal() {
    return new SyntaxError()
  }

  static Unexpected() {
    return new SyntaxError()
  }

  static isEqual(left: any, right: any) {
    return left === right
  }

  get lookahead(): ITokenType {
    return {
      type: 'Punctuator',
      name: 'foo'
    }
  }

  skipWhitespace() {
    return Tokenizer.Error()
  }

  end() {
    return Tokenizer.isEqual(this.lookahead, reserved.EOF)
  }

}
