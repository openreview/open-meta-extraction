import _ from 'lodash';

import { asyncEachOfSeries, setLogEnvLevel } from '@watr/commonlib';
import { fetchServiceExecScopeWithDeps } from './fetch-service';
import { FieldFrequencies, createFakeNoteList } from '~/db/mock-data';
import { fakeNoteIds, listNoteStatusIds, openreviewAPIForNotes, spiderableRoutes } from './testing-utils';
import { extractionServiceMonitor, scopedExtractionService } from './extraction-service';
import { shadowDBExecScopeWithDeps, shadowDBConfig } from './shadow-db';
import { Router, withHttpTestServer, scopedBrowserPool } from '@watr/spider';
import { taskSchedulerExecScope } from './task-scheduler';

describe('Extraction Service', () => {

  setLogEnvLevel('debug');

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

    for await (const { gracefulExit } of withHttpTestServer({ config, routerSetup })) {
      for await (const { browserPool } of scopedBrowserPool()({ gracefulExit })) {
        for await (const { fetchService, shadowDB, mongoQueries, mongoDB } of fetchServiceExecScopeWithDeps()(shadowConfig)) {
          for await (const { taskScheduler } of taskSchedulerExecScope()({ mongoDB })) {
            const dbModels = mongoDB.dbModels
            // Init the shadow db
            await fetchService.runFetchLoop(100);
            const noteStatusIds = await listNoteStatusIds(dbModels);
            expect(noteStatusIds).toMatchObject(fakeNoteIds(startingId, startingId + noteCount - 1));

            for await (const { extractionService } of scopedExtractionService()({ shadowDB, taskScheduler, browserPool, postResultsToOpenReview })) {

              await extractionService.runExtractFromBeginning(2, false);


              // Fake a successful extraction
              await shadowDB.updateFieldStatus('note#2', 'abstract', "Ipsem...");
              await mongoQueries.updateUrlStatus('note#2', { hasAbstract: true })

              await extractionService.runExtractNewlyImported(2, false);
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
