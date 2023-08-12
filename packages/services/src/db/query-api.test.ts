import _ from 'lodash';
import { loadConfig, prettyPrint, setLogEnvLevel } from '@watr/commonlib';
import { mongoQueriesExecScopeWithDeps } from './query-api';
import { populateDBHostNoteStatus } from './mock-data';

describe('MongoDB Queries', () => {

  setLogEnvLevel('info');

  it('should crud noteStatus records', async () => {});

  it('should create/update/delete fetch cursors', async () => {
    const config = loadConfig();

    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()({ useUniqTestDB: true, config })) {
      expect(await mongoQueries.getCursor('extract-fields/all')).toBeUndefined();
      expect(await mongoQueries.updateCursor('extract-fields/all', '1')).toMatchObject({ role: 'extract-fields/all', noteId: '1' });
      expect(await mongoQueries.updateCursor('extract-fields/newest', '2')).toMatchObject({ role: 'extract-fields/newest', noteId: '2' });
      expect(await mongoQueries.deleteCursor('extract-fields/all')).toBe(true);
      expect(await mongoQueries.deleteCursor('extract-fields/all')).toBe(false);
      expect(await mongoQueries.getCursor('extract-fields/all')).toBeUndefined();
    }
  });

  it('should advance cursors', async () => {
    const config = loadConfig();
    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()({ useUniqTestDB: true, config })) {
      const nocursor = await mongoQueries.createCursor('extract-fields/all', 'note#1');
      expect(nocursor).toBeUndefined();

      await populateDBHostNoteStatus(mongoQueries, 20);
      const cursor = await mongoQueries.createCursor('extract-fields/all', 'note#1');
      expect(cursor).toBeDefined();
      if (!cursor) return;

      prettyPrint({ cursor });

    }
  });


  it('get/update next spiderable host/url', async () => {
    const config = loadConfig();
    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()({ useUniqTestDB: true, config })) {
      const initEntry = await mongoQueries.upsertUrlStatus('asdf', 1, 'unknown', { hasAbstract: false });

      expect(initEntry.noteId).toEqual('asdf');
      expect(initEntry.noteNumber).toEqual(1);

      // TODO finish tests
      // const nextSpiderable = await mongoQueries.getNextSpiderableUrl();

      // expect(nextSpiderable).toBeDefined;

      // if (nextSpiderable !== undefined) {
      //   const noteId = nextSpiderable.id;
      //   const updateRes = await mongoQueries.upsertUrlStatus(noteId, 'spider:success', {
      //     httpStatus: 200
      //   });
      //   expect(updateRes._id).toEqual('asdf');
      // }

    }
  });

  it('should release all locks, allow for re-extraction of failed notes', async () => {
    const config = loadConfig();
    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()({ useUniqTestDB: true, config })) {
      await populateDBHostNoteStatus(mongoQueries, 200);
    }
  });

  // it.only('should record success/failure of field extraction', async () => {});
  // it('should record success/failure of field extraction', async () => {});
  // it('should find all notes w/unattempted field extractions', async () => {});
});
