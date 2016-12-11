import { ILocation } from './interface'

export class Location implements ILocation {

  public column: number
  public line: number

  constructor(source: string, position: number) {
    this.line = 1
    this.column = position + 1
    console.log(source, position)
  }
}
