import { isUrl, setLogEnvLevel } from '@watr/commonlib';
import * as fc from 'fast-check';
import { MongoQueries } from './query-api';

import { genHttpStatus, numberSeries } from './mock-data';

describe('MongoDB Schemas', () => {
  setLogEnvLevel('debug');

  const mdb = new MongoQueries();

  beforeAll(async () => {
    await mdb.connect();
    await mdb.dropDatabase();
    await mdb.createDatabase();
  });

  afterAll(async () => {
    await mdb.close();
  });

  it('should create/find note status', async () => {
    let i = 1;
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.oneof(fc.string(), fc.webUrl()),
        fc.oneof(fc.string(), fc.webUrl()),
        async (noteId, urlstr, urlmod) => {
          noteId = `${noteId}${i}`;
          const number = i;
          i++;
          // Insert new document
          let byId = await mdb.findNoteStatusById(noteId);
          expect(byId).toBeUndefined();
          byId = await mdb.upsertNoteStatus({ noteId, urlstr, number  });

          expect(byId).toBeDefined();
          if (byId === undefined) {
            fail('invalid null value');
          }

          expect(byId.validUrl).toEqual(isUrl(byId.url));

          // Modify existing document
          await mdb.upsertNoteStatus({ noteId, urlstr: urlmod  });
          const modById = await mdb.findNoteStatusById(noteId);
          expect(modById).toBeDefined();
          if (modById === undefined) {
            fail('invalid null value');
          }
          if (modById.validUrl) {
            expect(modById.url).toEqual(new URL(urlmod).href);
          }
        }
      ),
      { verbose: true }
    );
  });

  it('should create/find host status', async () => {
    let noteNum = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.string(), // noteId
        fc.boolean(), // hasAbstract
        fc.webUrl(), // requestUrl
        fc.oneof(fc.string(), fc.webUrl()), // response
        // fc.oneof(fc.string(), fc.webUrl(), fc.constant(undefined)), // response
        genHttpStatus,
        fc.string(), // TODO workflowStatus
        async (noteId, hasAbstract, requestUrl, response, httpStatus, _workflowStatus) => {
          // Insert new document
          const ret = await mdb.upsertUrlStatus(noteId, noteNum++, 'unknown', { hasAbstract, requestUrl, response, httpStatus });
          const byId = await mdb.findUrlStatusById(noteId);
          expect(byId).toBeDefined();
          if (byId === undefined) {
            fail('invalid null value');
          }

          expect(byId).toEqual(ret);
          expect(byId.validResponseUrl).toEqual(isUrl(response));
          expect(byId.responseHost !== undefined).toEqual(isUrl(response));

          // const lockedStatus = await upsertUrlStatus(noteId, 'spider:locked', {});
        }
      ),
      { verbose: true }
    );
  });
});
