import _ from 'lodash';
import { loadConfig, putStrLn, setLogEnvLevel } from '@watr/commonlib';
import { formatStatusMessages, showStatusSummary } from './extraction-summary';
import { populateDBHostNoteStatus } from './mock-data';
import { mongoQueriesExecScope } from './query-api';
import { mongooseExecScopeWithDeps } from './mongodb';

describe('Create Extraction Status Summary', () => {
  setLogEnvLevel('debug');

  it('should create status summary', async () => {
    const config = loadConfig();
    for await (const { mongoDB } of mongooseExecScopeWithDeps()({ useUniqTestDB: true, config })) {
      for await (const { mongoQueries } of mongoQueriesExecScope()({ mongoDB })) {
        await populateDBHostNoteStatus(mongoQueries, 200);
        const summaryMessages = await showStatusSummary();
        const formatted = formatStatusMessages(summaryMessages);
        putStrLn(formatted);
      }
    }
  });
});
