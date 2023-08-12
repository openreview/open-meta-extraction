import _ from 'lodash';
import { loadConfig, setLogEnvLevel } from '@watr/commonlib';

import { createFakeNote } from '~/db/mock-data';
import { shadowDBExecScope } from './shadow-db';
import { scopedMongoose } from '~/db/mongodb';
import { mongoQueriesExecScope } from '~/db/query-api';

describe('Shadow DB', () => {
  setLogEnvLevel('trace');

  it('should save note', async () => {

    const config = loadConfig();
    for await (const { mongoDB } of scopedMongoose()({ useUniqTestDB: true, config })) {
      for await (const { mongoQueries } of mongoQueriesExecScope()({ mongoDB })) {
        for await (const { shadowDB } of shadowDBExecScope()({ mongoQueries })) {
          const note1 = createFakeNote({ noteNumber: 1, hasAbstract: true, hasHTMLLink: true, hasPDFLink: false });
          expect(await shadowDB.findNote(note1.id)).toBeUndefined();
          await shadowDB.saveNote(note1, true);
          expect(await shadowDB.findNote(note1.id)).toMatchObject({ id: note1.id, validUrl: true });
          note1.content.html = 'bad-url';
          await shadowDB.saveNote(note1, true);
          expect(await shadowDB.findNote(note1.id)).toMatchObject({ id: note1.id, validUrl: false });
        }
      }
    }
  });
});
