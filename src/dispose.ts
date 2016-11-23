'use strict'
import { Observable } from 'rxjs/Observable'
import { SDK } from './SDK'

declare module './SDK' {
  export interface SDK {
    dispose: () => Observable<lf.Database>
  }
}

SDK.prototype.dispose = function(this: SDK) {
  return this.database$
    .do(db => db.close())
}
