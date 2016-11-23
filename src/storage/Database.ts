'use strict'
import 'rxjs/add/observable/from'
import 'rxjs/add/observable/of'
import 'rxjs/add/observable/throw'
import 'rxjs/add/operator/switchMap'
import 'rxjs/add/operator/concatMap'
import 'rxjs/add/operator/combineAll'
import 'rxjs/add/operator/catch'
import 'rxjs/add/operator/skip'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mapTo'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/toPromise'
import { Observable } from 'rxjs/Observable'
import { Observer } from 'rxjs/Observer'
import * as lf from 'lovefield'
import { lfFactory, schemaBuilder } from './lovefield'
import { forEach } from '../utils'

export interface SchemaMetadata {
  type: lf.Type
  primaryKey?: boolean
  index?: boolean
  unique?: string
  /**
   * alias to other table
   * 这里需要定义表名，字段和查询条件
   */
  virtual?: {
    name: string
    fields: string[]
    where<T> (table: lf.schema.Table, data: T): lf.Predicate
  }
}

export interface SchemaDef {
  [index: string]: SchemaMetadata
}

export interface HookDef {
  store?: (db: lf.Database, entity: any) => Promise<lf.Transaction>
  destroy?: (db: lf.Database, entity: any) => Promise<lf.Transaction>
}

export interface HooksDef {
  store: ((db: lf.Database, entity: any) => Promise<lf.Transaction>)[]
  destroy: ((db: lf.Database, entity: any) => Promise<lf.Transaction>)[]
}

/**
 * 在查询和更新数据的时候需要使用的元数据
 * 每次查询会遍历 VirtualMetadata，然后将需要使用的字段从对应的 VirtualTable 中查到，拼接到对应的字段上
 * 更新的时候也会查询是否更新的是 Virtual 字段，然后实际更新对应的 VirtualTable
 */
export interface VirtualMetadata {
  // table name
  name: string
  fields: Set<string>
  resultType?: 'Collection' | 'Model'
  where<T> (table: lf.schema.Table, data: T): lf.Predicate
}

export interface SelectMetadata {
  fields: Set<string>
  virtualMeta: Map<string, VirtualMetadata>
}

export class Database {
  database$: Observable<lf.Database>

  private static hooks = new Map<string, HooksDef>()
  private static primaryKeysMap = new Map<string, string>()
  private static selectMetaData = new Map<string, SelectMetadata>()

  /**
   * 定义数据表的 metadata
   * 会根据这些 metadata 决定增删改查的时候如何处理关联数据
   */
  static defineSchema(tableName: string, schemaMetaData: SchemaDef) {
    const tableBuilder = schemaBuilder.createTable(tableName)
    Database.hooks.set(tableName, {
      store: [],
      destroy: []
    })
    return Database.normalizeSchemaDef(tableName, schemaMetaData, tableBuilder)
  }

  /**
   * 在数据表上定义一些 hook
   * 这些 hook 的过程都是 transaction 组成
   */
  static defineHook(tableName: string, hookDef: HookDef) {
    const hooks = Database.hooks.get(tableName)
    if (hookDef.store) {
      hooks.store.push(hookDef.store)
    }
    if (hookDef.destroy) {
      hooks.destroy.push(hookDef.destroy)
    }
    return hookDef
  }

  constructor(
    storeType: lf.schema.DataStoreType = lf.schema.DataStoreType.MEMORY,
    enableInspector: boolean = false
  ) {
    this.database$ = lfFactory({ storeType, enableInspector })
  }

  store<T>(tableName: string, data: T[]): Observable<T[]>

  store<T>(tableName: string, data: T): Observable<T>

  store<T>(tableName: string, data: T | T[]): Observable<T> | Observable<T[]>

  /**
   * 存储数据到数据表
   * 先执行 store hook 列表中的 hook 再存储
   */
  store<T>(tableName: string, data: T | T[]): Observable<T> | Observable<T[]> {
    return this.database$
      .concatMap(db => {
        const table = db.getSchema().table(tableName)
        let hook: Observable<lf.Database> = Observable.of(db)
        const rows: lf.Row[] = []
        if (data instanceof Array) {
          const hookObservables: Observable<lf.Transaction>[] = []
          data.forEach(r => {
            rows.push(table.createRow(r))
            const hooks = Database.hooks.get(tableName)
            const hookStream = Observable.from(hooks.store)
              .concatMap(fn => fn(db, r))
              .skip(hooks.store.length - 1)
            hookObservables.push(hookStream)
          })
          hook = Observable.from(hookObservables)
            .combineAll()
        } else {
          rows.push(table.createRow(data))
          const hooks = Database.hooks.get(tableName)
          if (hooks && hooks.store) {
            hook = Observable.from(hooks.store)
              .concatMap(fn => fn(db, data))
              .skip(hooks.store.length - 1)
              .mapTo(db)
          }
        }
        return hook.concatMap(() => {
          return db.insertOrReplace()
            .into(table)
            .values(rows)
            .exec()
        })
      })
  }

  get<T>(tableName: string, primaryValue: string): Observable<T> {
    const primaryKey = Database.primaryKeysMap.get(tableName)
    if (!primaryKey) {
      return Observable.throw(new TypeError(`table not exist: ${tableName}`))
    }
    const selectMetadata = Database.selectMetaData.get(tableName)
    return this.database$
      .concatMap(db => {
        const table = db.getSchema().table(tableName)
        const colum: lf.schema.Column[] = Array.from(selectMetadata.fields)
          .map(field => table[field])
        const query = ( db.select.apply(db, colum) as lf.query.Select)
          .from(table)
          .where(table[primaryKey].eq(primaryValue))
          .exec()
        return this.serialize(db, query, selectMetadata.virtualMeta)
      })
  }

  update<T>(tableName: string, primaryValue: string, patch: T) {
    const primaryKey = Database.primaryKeysMap.get(tableName)
    if (!primaryKey) {
      return Observable.throw(new TypeError(`table not exist: ${tableName}`))
    }
    const selectMetadata = Database.selectMetaData.get(tableName)
    return this.database$
      .concatMap(db => {
        const table = db.getSchema().table(tableName)
        let updateQuery: lf.query.Update
        forEach(patch, (val, key) => {
          const col = table[key]
          const virtualMeta = selectMetadata.virtualMeta.get(key)
          if (typeof col === 'undefined') {
            console.warn(`patch key is not defined in table: ${key}`)
          } else if (!virtualMeta) {
            updateQuery = db.update(table)
              .set(table[key], val)
          }
        })
        return updateQuery
          .where(table[primaryKey].eq(primaryValue))
          .exec()
      })
  }

  listenTo<T>(tableName: string, cond: (table: lf.schema.Table) => lf.Predicate): Observable<T | T[]> {
    return this.database$.concatMap(db => {
      const table = db.getSchema().table(tableName)
      if (!table) {
        return Observable.throw(new TypeError(`table not exist: ${tableName}`))
      }
      return Observable.create((observer: Observer<T>) => {
        const query = db.select()
          .from(table)
          .where(cond(table))
        const callback = () => {
          query.exec()
            .then(r => observer.next(<any>(r)))
            .catch(e => observer.error(e))
        }
        db.observe(query, callback)
        return db.unobserve(query, callback)
      })
    })
  }

  /**
   * 解析 schemaMetaData
   * 根据解析后的 metadata 建表
   * 根据 metadata 中定义的关联关系新建 store hook
   */
  private static normalizeSchemaDef(
    tableName: string,
    schemaMetaData: SchemaDef,
    tableBuilder: lf.schema.TableBuilder
  ) {
    const uniques: string[] = []
    const indexes: string[] = []
    const primaryKey: string[] = []
    const nullable: string[] = []
    const fields = new Set<string>()
    const virtualMeta = new Map<string, VirtualMetadata>()
    forEach(schemaMetaData, (def, key) => {
      tableBuilder = tableBuilder.addColumn(key, def.type)
      fields.add(key)
      if (def.primaryKey) {
        primaryKey.push(key)
        this.primaryKeysMap.set(tableName, key)
      } else if (def.unique != null) {
        uniques.push(key)
      } else if (def.index) {
        indexes.push(key)
      } else {
        nullable.push(key)
      }

      if (def.virtual) {
        fields.delete(key)
        virtualMeta.set(key, {
          where: def.virtual.where,
          name: def.virtual.name,
          fields: new Set(def.virtual.fields)
        })
        Database.defineHook(tableName, {
          store: (db: lf.Database, entity: any) => {
            return Database.createStoreHook(db, tableName, key, def, entity)
          }
        })
      }
    })
    const selectResult = { fields, virtualMeta }
    this.selectMetaData.set(tableName, selectResult)
    if (!primaryKey.length) {
      throw new TypeError(`No primaryKey key give in schemaMetaData: ${JSON.stringify(schemaMetaData, null, 2)}`)
    }
    tableBuilder = tableBuilder.addPrimaryKey(primaryKey)
    if (indexes.length) {
      tableBuilder.addIndex('index', indexes)
    }
    if (uniques.length) {
      tableBuilder.addUnique('unique', uniques)
    }
    if (nullable.length) {
      tableBuilder.addNullable(nullable)
    }
    return selectResult
  }

  /**
   * 在 normalize 的时候定义 storeHook
   * 在 store 数据到这个 table 的时候调用
   * 这里新建的 hook 是把 schemaMetaData 中的关联的数据剥离，单独存储
   */
  private static createStoreHook(
    db: lf.Database,
    tableName: string,
    key: string,
    def: SchemaMetadata,
    entity: any
  ) {
    const virtualProp: any = entity[key]
    if (virtualProp) {
      const primaryKey = this.primaryKeysMap.get(def.virtual.name)
      const virtualTable = db.getSchema().table(def.virtual.name)
      const virtualMetadata = this.selectMetaData
            .get(tableName)
            .virtualMeta
      if (typeof virtualProp === 'object') {
        if (virtualProp instanceof Array) {
          virtualMetadata.get(key)
            .resultType = 'Collection'
          return Observable.from(virtualProp)
            .concatMap(_virtualProp => Database.insertOrUpdateVirtualProp(db, primaryKey, virtualTable, _virtualProp))
            .skip(virtualProp.length - 1)
            .do(() => delete entity[key])
            .toPromise()
        } else {
          virtualMetadata.get(key)
            .resultType = 'Model'
          return Database.insertOrUpdateVirtualProp(db, primaryKey, virtualTable, virtualProp)
            .then(() => delete entity[key])
        }
      } else {
        return Promise.reject( new TypeError(`Invalid value ${virtualProp}, expect it is Object or Array`) )
      }
    } else {
      return Promise.resolve()
    }
  }

  /**
   * 将 virtual prop 分离存储
   * 比如 TaskSchema:
   * {
   *   _id: TaskId,
   *   project: {
   *     _id: ProjectId,
   *     name: string
   *   }
   *   ...
   * }
   * 这个方法会将 project 字段从 TaskSchema 上剥离，存储到对应的 Project 表中
   * 表的名字定义在 schemaMetaData 中
   */
  private static insertOrUpdateVirtualProp (
    db: lf.Database,
    primaryKey: string,
    virtualTable: lf.schema.Table,
    virtualProp: any
  ) {
    const query = db.select()
      .from(virtualTable)
      .where(virtualTable[primaryKey].eq(virtualProp[primaryKey]))
    const tx = db.createTransaction()
    return tx.begin([virtualTable])
      .then(() => tx.attach(query))
      .then(result => {
        if (result.length) {
          const updateQuery = db.update(virtualTable)
            .where(virtualTable[primaryKey].eq(virtualProp[primaryKey]))
          forEach(virtualProp, (prop, propName) => {
            if (propName !== primaryKey) {
              updateQuery.set(virtualTable[propName], prop)
            }
          })
          return tx.attach(updateQuery)
        } else {
          const row = virtualTable.createRow(virtualProp)
          const query = db.insert()
            .into(virtualTable)
            .values([row])
          return tx.attach(query)
        }
      })
      .then(() => tx.commit())
      .catch((e: any) => {
        return tx.rollback()
          .then(() => Promise.reject(e))
      })
  }

  private serialize<T>(
    db: lf.Database,
    query: Promise<Object[]>,
    virtualMetadatas: Map<string, VirtualMetadata>
  ): Observable<T> {
    const subQuery: Promise<any>[] = []
    let result: T
    return Observable.from(query)
      .do(([_result]) => {
        virtualMetadatas.forEach((virtualMetadata, key) => {
          const table = db.getSchema().table(virtualMetadata.name)
          const colums = Array.from(virtualMetadata.fields)
            .map(field => table[field]);
          const q = (db.select.apply(db, colums) as lf.query.Select)
            .from(table)
            .where(virtualMetadata.where(table, _result))
            .exec()
            .then(result => {
              if (virtualMetadata.resultType === 'Model') {
                _result[key] = result[0]
              } else {
                _result[key] = result
              }
            })
          subQuery.push(q)
        })
        result = <any>(_result)
      })
      .concatMap(() => Promise.all(subQuery))
      .map(() => result)
  }
}
