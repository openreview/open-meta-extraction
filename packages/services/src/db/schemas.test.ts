import { isUrl, setLogEnvLevel } from '@watr/commonlib';
import * as fc from 'fast-check';
import { mongoQueriesExecScopeWithDeps } from './query-api';
import { genHttpStatus } from './mock-data';
import { mongoTestConfig } from './mongodb';

describe('MongoDB Schemas', () => {
  setLogEnvLevel('debug');


  it('should create/find note status', async () => {

    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()(mongoTestConfig())) {
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
            let byId = await mongoQueries.findNoteStatusById(noteId);
            expect(byId).toBeUndefined();
            byId = await mongoQueries.upsertNoteStatus({ noteId, urlstr, number });

            expect(byId).toBeDefined();
            if (byId === undefined) {
              fail('invalid null value');
            }

            expect(byId.validUrl).toEqual(isUrl(byId.url));

            // Modify existing document
            await mongoQueries.upsertNoteStatus({ noteId, urlstr: urlmod });
            const modById = await mongoQueries.findNoteStatusById(noteId);
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
    }
  });

  it('should create/find host status', async () => {

    for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()(mongoTestConfig())) {
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
            const ret = await mongoQueries.upsertUrlStatus(noteId, noteNum++, 'unknown', { hasAbstract, requestUrl, response, httpStatus });
            const byId = await mongoQueries.findUrlStatusById(noteId);
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
    }
  });
});
