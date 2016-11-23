'use strict'
import * as lf from 'lovefield'
import { TeambitionTypes, Database } from '../index'

export interface ProjectSchema extends lf.schema.Table {
  _id: TeambitionTypes.ProjectId
  name: string
}
export default Database.defineSchema('Project', {
  _id: {
    type: lf.Type.STRING,
    primaryKey: true
  },
  name: {
    type: lf.Type.STRING
  }
})
