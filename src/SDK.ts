'use strict'
import * as lf from 'lovefield'
import { Observable } from 'rxjs/Observable'
import { Database } from './storage/Database'
import { LfFactoryInit } from './storage/lovefield'

export class SDK {
  database$: Observable<lf.Database>

  constructor(lfConfig: LfFactoryInit) {
    this.database$ = new Database(lfConfig.storeType, lfConfig.enableInspector)
      .database$
  }
}
