'use strict'
import * as lf from 'lovefield'
import '../schemas'
import { Database } from '../../src/storage/Database'

const database = new Database(lf.schema.DataStoreType.INDEXED_DB, true)

database.store('Task', [{
  _id: '1111',
  note: 'note',
  content: 'content',
  xxx: 'test xxx',
  _projectId: 'haha',
  project: {
    _id: 'haha',
    name: 'xxx'
  },
  subtasks: [
    {
      _id: 'subtask 1',
      name: 'subtask 1',
      taskId: '1111'
    },{
      _id: 'subtask 2',
      name: 'subtask 2',
      taskId: '1111'
    }
  ]
}, {
  _id: '2222',
  note: 'note 2',
  content: 'content2',
  _projectId: 'haha',
  project: {
    _id: 'haha',
    name: 'xxx'
  },
  subtasks: [
    {
      _id: 'subtask 3',
      name: 'subtask 3',
      taskId: '3'
    },{
      _id: 'subtask 4',
      name: 'subtask 4',
      taskId: '4'
    }
  ]
}])
  .concatMap(() => {
    return database.get('Task', '1111')
  })
  .subscribe(r => {
    console.log(222, r)
  }, err => {
    console.error(err)
  })
