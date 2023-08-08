import _ from 'lodash';
import { putStrLn, setLogEnvLevel } from '@watr/commonlib';
import { formatStatusMessages, showStatusSummary } from './extraction-summary';
import { populateDBHostNoteStatus } from './mock-data';
import { scopedMongoQueries } from './query-api';
import { scopedMongoose } from './mongodb';

describe('Create Extraction Status Summary', () => {
  setLogEnvLevel('debug');

  it('should create status summary', async () => {
    for await (const { mongoose } of scopedMongoose.use({ uniqDB: true })) {
      for await (const { mongoQueries } of scopedMongoQueries.use({ mongoose })) {
        await populateDBHostNoteStatus(mongoQueries, 200);
        const summaryMessages = await showStatusSummary();
        const formatted = formatStatusMessages(summaryMessages);
        putStrLn(formatted);
      }
    }
  });
});
