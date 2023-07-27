import _ from 'lodash';
import { putStrLn, setLogEnvLevel } from '@watr/commonlib';
import { formatStatusMessages, showStatusSummary } from './extraction-summary';
import { populateDBHostNoteStatus } from './mock-data';
import { withMongoQueriesGen } from './query-api';

describe('Create Extraction Status Summary', () => {
  setLogEnvLevel('debug');

  it('create status summary', async () => {
    for await (const { mdb } of withMongoQueriesGen({ uniqDB: true })) {
      await populateDBHostNoteStatus(mdb, 200);
      const summaryMessages = await showStatusSummary();
      const formatted = formatStatusMessages(summaryMessages);
      putStrLn(formatted);
    }
  });
});
