import _ from 'lodash';
import { putStrLn, setLogEnvLevel } from '@watr/commonlib';
import { formatStatusMessages, showStatusSummary } from './extraction-summary';
import { populateDBHostNoteStatus } from './mock-data';
import { mongoQueriesExecScope } from './query-api';
import { scopedMongoose, scopedMongooseWithDeps } from './mongodb';

describe('Create Extraction Status Summary', () => {
  setLogEnvLevel('debug');

  it('should create status summary', async () => {
    for await (const { mongoose } of scopedMongooseWithDeps()({ useUniqTestDB: true })) {
      for await (const { mongoQueries } of mongoQueriesExecScope()({ mongoose })) {
        await populateDBHostNoteStatus(mongoQueries, 200);
        const summaryMessages = await showStatusSummary();
        const formatted = formatStatusMessages(summaryMessages);
        putStrLn(formatted);
      }
    }
  });
});
