import * as lf from 'lovefield'
import { TeambitionTypes, Database } from '../index'

export interface TaskSchema {
  _id: TeambitionTypes.TaskId
  content: string
  note: string
  _projectId: TeambitionTypes.ProjectId
  project?: {
    _id: TeambitionTypes.ProjectId
    name: string
  }
}

export default Database.defineSchema('Task', {
  _id: {
    type: lf.Type.STRING,
    primaryKey: true
  },
  content: {
    type: lf.Type.STRING
  },
  note: {
    type: lf.Type.STRING
  },
  _projectId: {
    type: lf.Type.STRING
  },
  project: {
    type: lf.Type.OBJECT,
    virtual: {
      name: 'Project',
      fields: ['_id', 'name'],
      where: (
        projectTable: lf.schema.Table,
        task: TaskSchema
      ) => {
        return projectTable['_id'].eq(task._projectId)
      }
    }
  },
  subtasks: {
    type: lf.Type.OBJECT,
    virtual: {
      name: 'Subtask',
      fields: ['_id', 'name'],
      where: (table: lf.schema.Table, task: TaskSchema) => {
        return table['taskId'].eq(task._id)
      }
    }
  }
})
