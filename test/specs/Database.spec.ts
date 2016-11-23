import * as lf from 'lovefield'
import { describe, it } from 'tman'
import { expect } from 'chai'
import { Database } from '../index'

export default describe('Database spec', () => {

  describe('Database.defineSchema', () => {
    it('should throw without primaryKey', () => {
      const metaData = {
        _id: {
          type: lf.Type.STRING
        }
      }
      const define = () => {
        Database.defineSchema('TestTable' , metaData)
      }
      expect(define).to.throw(`No primaryKey key give in schemaMetaData: ${JSON.stringify(metaData, null, 2)}`)
    })

    it('should return selectMetadata', () => {
      const metaData = {
        _id: {
          type: lf.Type.STRING,
          primaryKey: true
        },
        name: {
          type: lf.Type.STRING
        },
        juju: {
          type: lf.Type.OBJECT,
          virtual: {
            name: 'JuJu',
            fields: ['_id', 'name', 'age'],
            where: (table: lf.schema.Table, data: any) => {
              return table['name'].eq(data.name)
            }
          }
        }
      }
      const selectMetadata = Database.defineSchema('TestTable2', metaData)
      expect(selectMetadata.fields).to.deep.equal(new Set(['_id', 'name']))
      const virtualMetadata = selectMetadata.virtualMeta.get('juju')
      expect(virtualMetadata.fields).to.deep.equal(new Set(['_id', 'name', 'age']))
      expect(virtualMetadata.name).to.equal('JuJu')
      expect(virtualMetadata.where).to.deep.equal(metaData.juju.virtual.where)
    })
  })
})
