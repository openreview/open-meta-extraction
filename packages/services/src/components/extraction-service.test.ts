import _ from 'lodash';

import { asyncEachOfSeries, setLogEnvLevel, prettyPrint } from '@watr/commonlib';
import { fetchServiceExecScopeWithDeps } from './fetch-service';
import { createFakeNoteList } from '~/db/mock-data';
import { fakeNoteIds, listNoteStatusIds, openreviewAPIForNotes, spiderableRoutes } from './testing-utils';
import { extractionServiceMonitor, scopedExtractionService } from './extraction-service';
import { CursorRole, MongoQueries } from '~/db/query-api';
import { shadowDBExecScopeWithDeps, shadowDBTestConfig } from './shadow-db';
import { Router, withHttpTestServer } from '@watr/spider';
import { scopedTaskScheduler } from './task-scheduler';
import { scopedBrowserPool } from '@watr/spider';

describe('Extraction Service', () => {

  setLogEnvLevel('debug');

  it.only('should run end-to-end', async () => {
    const shadowDBConfig = shadowDBTestConfig();
    const config = shadowDBConfig.config;
    const noteCount = 10;
    const batchSize = 2;
    const startingId = 1;
    const notes = createFakeNoteList(config, noteCount, startingId);
    const routerSetup = (r: Router) => {
      openreviewAPIForNotes({ notes, batchSize })(r)
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

    for await (const { gracefulExit } of withHttpTestServer({ config, routerSetup })) {
      for await (const { browserPool } of scopedBrowserPool()({ gracefulExit })) {
        for await (const { fetchService, shadowDB, mongoQueries } of fetchServiceExecScopeWithDeps()(shadowDBConfig)) {
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

    const config = shadowDBTestConfig();
    for await (const { shadowDB } of shadowDBExecScopeWithDeps()(config)) {

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
