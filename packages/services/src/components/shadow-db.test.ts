import _ from 'lodash';
import { setLogEnvLevel } from '@watr/commonlib';

import { createFakeNote } from '~/db/mock-data';
import { shadowDBExecScope, shadowDBConfig } from './shadow-db';
import { scopedMongoose } from '~/db/mongodb';
import { mongoQueriesExecScope } from '~/db/query-api';

describe('Shadow DB', () => {
  setLogEnvLevel('trace');

  const shadowConfig = shadowDBConfig();
  const config = shadowConfig.config;

  it('should save note', async () => {

    for await (const { mongoDB } of scopedMongoose()(shadowConfig)) {
      for await (const { mongoQueries } of mongoQueriesExecScope()({ mongoDB })) {
        for await (const { shadowDB } of shadowDBExecScope()({ mongoQueries, ...shadowConfig })) {
          const note1 = createFakeNote({ config, noteNumber: 1, hasAbstract: true, hasHTMLLink: true, hasPDFLink: false });
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
