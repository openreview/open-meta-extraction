import _ from 'lodash';
import { setLogEnvLevel } from '@watr/commonlib';
import { mongoQueriesExecScopeWithDeps } from './query-api';
import { mongoConfig } from './mongodb';

describe('MongoDB Queries', () => {

  setLogEnvLevel('info');

  it('should create/update Url Status', async () => {
    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()(mongoConfig())) {
      const initEntry = await mongoQueries.upsertUrlStatus('asdf', 1, 'unknown', { hasAbstract: false });

      expect(initEntry.noteId).toEqual('asdf');
      expect(initEntry.noteNumber).toEqual(1);

    }
  });

});
