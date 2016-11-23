'use strict'
import * as lf from 'lovefield'
import { TeambitionTypes, Database } from '../index'

export interface SubtaskSchema {
  _id: TeambitionTypes.SubtaskId
  name: string
  taskId: TeambitionTypes.TaskId
}

export default Database.defineSchema('Subtask', {
  _id: {
    type: lf.Type.STRING,
    primaryKey: true
  },
  name: {
    type: lf.Type.STRING
  },
  taskId: {
    type: lf.Type.STRING
  }
})
