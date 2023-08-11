import _ from 'lodash';

import { asyncEachOfSeries, withGracefulExit, setLogEnvLevel, prettyPrint } from '@watr/commonlib';
import { scopedFetchService, scopedFetchServiceWithDeps } from './fetch-service';
import { createFakeNoteList } from '~/db/mock-data';
import { fakeNoteIds, listNoteStatusIds, openreviewAPIForNotes, spiderableRoutes } from './testing-utils';
import { extractionServiceMonitor, scopedExtractionService } from './extraction-service';
import { CursorRole, MongoQueries, scopedMongoQueries } from '~/db/query-api';
import { scopedShadowDB, scopedShadowDBWithDeps } from './shadow-db';
import { Router, scopedHttpServer, scopedHttpServerWithDeps } from '@watr/spider/src/http-server/http-service';
import { scopedMongoose } from '~/db/mongodb';
import { scopedTaskScheduler, scopedTaskSchedulerWithDeps } from './task-scheduler';
import { scopedBrowserPool } from '@watr/spider';

describe('Extraction Service', () => {

  setLogEnvLevel('debug');

  it('should run end-to-end', async () => {
    const noteCount = 10;
    const batchSize = 2;
    const startingId = 1;
    const notes = createFakeNoteList(noteCount, startingId);
    const routes = openreviewAPIForNotes({ notes, batchSize });
    const spiderRoutes = spiderableRoutes();
    const postResultsToOpenReview = true;

    async function checkCursor(mdb: MongoQueries, role: CursorRole, noteId: string) {
      const c1 = await mdb.getCursor(role);
      expect(c1).toBeDefined()
      if (!c1) {
        throw new Error('checkCursor: undefined');
      }
      expect(c1.noteId).toBe(noteId)
    }
    const port = 9100;
    for await (const { gracefulExit } of scopedHttpServerWithDeps()({ port, routerSetup: (r: Router) => { routes(r); spiderRoutes(r) } })) {
      for await (const { browserPool } of scopedBrowserPool()({ gracefulExit })) {
        for await (const { fetchService, shadowDB, mongoQueries } of scopedFetchServiceWithDeps()({ useUniqTestDB: true })) {
          for await (const { taskScheduler } of scopedTaskScheduler()({ mongoQueries })) {
            // Init the shadow db
            await fetchService.runFetchLoop(100);
            const noteStatusIds = await listNoteStatusIds();
            prettyPrint({ noteStatusIds })
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
              mongoQueries.updateUrlStatus('note#2', { hasAbstract: true })

              await taskScheduler.createUrlCursor('extract-fields/newest');
              await checkCursor(mongoQueries, 'extract-fields/newest', 'note#3');

              await extractionService.runExtractionLoop(2, false);
              // await checkCursor(mongoQueries, 'extract-fields/newest', 'note#5');
            }
          }
        }
      }
    }
  });

  it('should monitor newly extracted fields', async () => {
    for await (const { shadowDB } of scopedShadowDBWithDeps()({ useUniqTestDB: true })) {

      shadowDB.writeChangesToOpenReview = false;

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
      await extractionServiceMonitor();
    }
  });
});
