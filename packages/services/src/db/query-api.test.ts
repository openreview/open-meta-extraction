import _ from 'lodash';
import { prettyPrint, setLogEnvLevel } from '@watr/commonlib';
import { mongoQueriesExecScopeWithDeps } from './query-api';
import { populateDBHostNoteStatus } from './mock-data';
import { mongoConfig } from './mongodb';

describe('MongoDB Queries', () => {

  setLogEnvLevel('info');




  it('get/update next spiderable host/url', async () => {
    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()(mongoConfig())) {
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
    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()(mongoConfig())) {
      await populateDBHostNoteStatus(mongoQueries, 200);
    }
  });

  // it.only('should record success/failure of field extraction', async () => {});
  // it('should record success/failure of field extraction', async () => {});
  // it('should find all notes w/unattempted field extractions', async () => {});
});
