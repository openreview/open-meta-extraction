import _ from 'lodash';
import { setLogEnvLevel } from '@watr/commonlib';

import { createFakeNote } from '~/db/mock-data';
import { scopedShadowDB } from './shadow-db';
import { scopedMongoose } from '~/db/mongodb';
import { scopedMongoQueries } from '~/db/query-api';

describe('Shadow DB', () => {
  setLogEnvLevel('trace');

  it('should save note', async () => {

    for await (const { mongoose } of scopedMongoose({ useUniqTestDB: true })) {
      for await (const { mongoQueries } of scopedMongoQueries({ mongoose })) {
        for await (const { shadowDB } of scopedShadowDB({ mongoQueries })) {
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
