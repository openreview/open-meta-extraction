import _ from 'lodash';
import { prettyPrint, setLogEnvLevel } from '@watr/commonlib';
import { withMongoQueriesGen } from './query-api';
import { populateDBHostNoteStatus } from './mock-data';

describe('MongoDB Queries', () => {

  setLogEnvLevel('info');

  it('should crud noteStatus records', async () => {});

  it('should create/update/delete fetch cursors', async () => {
    for await (const { mdb } of withMongoQueriesGen({ uniqDB: true })) {
      expect(await mdb.getCursor('extract-fields/all')).toBeUndefined();
      expect(await mdb.getCursor('fetch-openreview-notes')).toBeUndefined();
      expect(await mdb.updateCursor('extract-fields/all', '1')).toMatchObject({ role: 'extract-fields/all', noteId: '1' });
      expect(await mdb.updateCursor('extract-fields/newest', '2')).toMatchObject({ role: 'extract-fields/newest', noteId: '2' });
      expect(await mdb.deleteCursor('extract-fields/all')).toBe(true);
      expect(await mdb.deleteCursor('extract-fields/all')).toBe(false);
      expect(await mdb.getCursor('extract-fields/all')).toBeUndefined();
    }
  });

  it('should lock/unlock/advance cursors', async () => {
    for await (const { mdb } of withMongoQueriesGen({ uniqDB: true })) {
      const nocursor = await mdb.createCursor('extract-fields/all', 'note#1');
      expect(nocursor).toBeUndefined();

      await populateDBHostNoteStatus(mdb, 20);
      const cursor = await mdb.createCursor('extract-fields/all', 'note#1');
      expect(cursor).toBeDefined();
      if (!cursor) return;

      const locked = await mdb.lockCursor(cursor._id);
      const unlocked = await mdb.unlockCursor(cursor._id);
      const advanced = await mdb.advanceCursor(cursor._id);

      prettyPrint({ cursor, locked, unlocked, advanced });

    }
  });


  it('get/update next spiderable host/url', async () => {
    for await (const { mdb } of withMongoQueriesGen({ uniqDB: true })) {
      const initEntry = await mdb.upsertUrlStatus('asdf', 1, 'unknown', { hasAbstract: false });

      expect(initEntry.noteId).toEqual('asdf');
      expect(initEntry.noteNumber).toEqual(1);

      // const nextSpiderable = await mdb.getNextSpiderableUrl();

      // expect(nextSpiderable).toBeDefined;

      // if (nextSpiderable !== undefined) {
      //   const noteId = nextSpiderable._id;
      //   const updateRes = await mdb.upsertUrlStatus(noteId, 'spider:success', {
      //     httpStatus: 200
      //   });
      //   expect(updateRes._id).toEqual('asdf');
      // }
    }
  });

  it('should release all locks, allow for re-extraction of failed notes', async () => {
    for await (const { mdb } of withMongoQueriesGen({ uniqDB: true })) {
      await populateDBHostNoteStatus(mdb, 200);
    }
  });

  // it.only('should record success/failure of field extraction', async () => {});
  // it('should record success/failure of field extraction', async () => {});
  // it('should find all notes w/unattempted field extractions', async () => {});
});
