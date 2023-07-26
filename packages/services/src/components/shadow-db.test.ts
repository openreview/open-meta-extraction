import _ from 'lodash';
import { setLogEnvLevel } from '@watr/commonlib';

import { createFakeNote } from '~/db/mock-data';
import { ShadowDB } from './shadow-db';
import { withMongo } from '~/db/mongodb';
import { createMongoQueries } from '~/db/query-api';

export async function withShadowDB(
  run: (sdb: ShadowDB) => Promise<void>
) {
    await withMongo({
      uniqDB: true,
      run: async (mongoose) => {
        const mdb = await createMongoQueries(mongoose);
        const sdb = new ShadowDB(mdb);
        await run(sdb);
      }
    });

  // return withMongo(async () => {
  //   const sdb = new ShadowDB();
  //   await sdb.connect();
  //   await run(sdb);
  //   await sdb.close();
  // }, true);
}
describe('Shadow DB', () => {
  setLogEnvLevel('trace');

  it('should save note', async () => {
    await withShadowDB(async (sdb) => {
      const note1 = createFakeNote({ noteNumber: 1, hasAbstract: true, hasHTMLLink: true, hasPDFLink: false });
      expect(await sdb.findNote(note1.id)).toBeUndefined();
      await sdb.saveNote(note1, true);
      expect(await sdb.findNote(note1.id)).toMatchObject({ id: note1.id, validUrl: true });
      note1.content.html = 'bad-url';
      await sdb.saveNote(note1, true);
      expect(await sdb.findNote(note1.id)).toMatchObject({ id: note1.id, validUrl: false });
    });
  });
});
