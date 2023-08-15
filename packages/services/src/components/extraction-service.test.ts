import _ from 'lodash';

import { asyncEachOfSeries, setLogEnvLevel, prettyPrint } from '@watr/commonlib';
import { fetchServiceExecScopeWithDeps } from './fetch-service';
import { FieldFrequencies, createFakeNoteList } from '~/db/mock-data';
import { fakeNoteIds, listNoteStatusIds, openreviewAPIForNotes, spiderableRoutes } from './testing-utils';
import { extractionServiceMonitor, scopedExtractionService } from './extraction-service';
import { CursorRole, MongoQueries } from '~/db/query-api';
import { shadowDBExecScopeWithDeps, shadowDBConfig } from './shadow-db';
import { Router, withHttpTestServer } from '@watr/spider';
import { scopedTaskScheduler } from './task-scheduler';
import { scopedBrowserPool } from '@watr/spider';

describe('Extraction Service', () => {

  setLogEnvLevel('warn');

  it('should run end-to-end', async () => {
    const shadowConfig = shadowDBConfig();
    const config = shadowConfig.config;
    const noteCount = 10;
    const batchSize = 2;
    const startingId = 1;

    const fieldFrequencies: FieldFrequencies = {
      validHtmlLinkFreq: [4, 5],
      abstractFreq: [1, 2],
      pdfLinkFreq: [1, 3]
    };

    const notes = createFakeNoteList(config, noteCount, fieldFrequencies, startingId);
    const routerSetup = (r: Router, port: number) => {
      openreviewAPIForNotes({ notes, batchSize })(r, port)
      spiderableRoutes()(r);
    };
    const postResultsToOpenReview = true;

    async function checkCursor(mdb: MongoQueries, role: CursorRole, noteId: string) {
      const c1 = await mdb.getCursor(role);
      expect(c1).toBeDefined()
      if (!c1) {
        throw new Error('checkCursor: undefined');
      }
      expect(c1.noteId).toBe(noteId)
    }

    async function checkCursorUndefined(mdb: MongoQueries, role: CursorRole) {
      const c1 = await mdb.getCursor(role);
      expect(c1).toBeUndefined()
    }

    for await (const { gracefulExit, httpServer } of withHttpTestServer({ config, routerSetup })) {
      for await (const { browserPool } of scopedBrowserPool()({ gracefulExit })) {
        for await (const { fetchService, shadowDB, mongoQueries, mongoDB } of fetchServiceExecScopeWithDeps()(shadowConfig)) {
          for await (const { taskScheduler } of scopedTaskScheduler()({ mongoQueries })) {
            const dbModels = mongoDB.dbModels
            // Init the shadow db
            await fetchService.runFetchLoop(100);
            const noteStatusIds = await listNoteStatusIds(dbModels);
            expect(noteStatusIds).toMatchObject(fakeNoteIds(startingId, startingId + noteCount - 1));
            for await (const { extractionService } of scopedExtractionService()({ shadowDB, taskScheduler, browserPool, postResultsToOpenReview })) {

              // Start from beginning
              await taskScheduler.createUrlCursor('extract-fields/all');
              await checkCursor(mongoQueries, 'extract-fields/all', 'note#1');

              await extractionService.runExtractionLoop(2, false);

              // Next note should be note#3
              await checkCursor(mongoQueries, 'extract-fields/all', 'note#3');


              // Reset to beginning
              await taskScheduler.deleteUrlCursor('extract-fields/all');
              await taskScheduler.createUrlCursor('extract-fields/all');
              await checkCursor(mongoQueries, 'extract-fields/all', 'note#1');


              // Fake a successful extraction
              await shadowDB.updateFieldStatus('note#2', 'abstract', "Ipsem...");
              await mongoQueries.updateUrlStatus('note#2', { hasAbstract: true })

              await taskScheduler.createUrlCursor('extract-fields/newest');
              await checkCursorUndefined(mongoQueries, 'extract-fields/newest');

              await extractionService.runExtractionLoop(2, false);
              // await checkCursor(mongoQueries, 'extract-fields/newest', 'note#5');
            }
          }
        }
      }
    }
  });

  it('should monitor newly extracted fields', async () => {

    const config = shadowDBConfig();
    for await (const { shadowDB, mongoDB } of shadowDBExecScopeWithDeps()(config)) {

      const noteIds = fakeNoteIds(1, 100);
      await asyncEachOfSeries(noteIds, async (noteId, i) => {
        const theAbstract = 'Ipsem..'
        const pdf = 'http://some/paper.pdf';
        if (i % 2 === 0) {
          await shadowDB.updateFieldStatus(noteId, 'abstract', theAbstract);
        }
        if (i % 3 === 0) {
          await shadowDB.updateFieldStatus(noteId, 'pdf', pdf);
        }
      });
      await extractionServiceMonitor(mongoDB.dbModels);
    }
  });
});
