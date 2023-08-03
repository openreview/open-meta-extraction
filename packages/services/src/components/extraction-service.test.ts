import _ from 'lodash';
import { asyncEachOfSeries, asyncEachSeries, prettyPrint, setLogEnvLevel } from '@watr/commonlib';

import { withServerGen } from '@watr/spider';
import { useFetchService } from './fetch-service';
import { createFakeNoteList } from '~/db/mock-data';
import { fakeNoteIds, listNoteStatusIds, openreviewAPIForNotes, spiderableRoutes } from './testing-utils';
import { extractionServiceMonitor, withExtractionService } from './extraction-service';
import { CursorRole, MongoQueries } from '~/db/query-api';
import { useShadowDB } from './shadow-db';

describe('Extraction Service', () => {

  setLogEnvLevel('warn');

  it('smokescreen', async () => {
    const noteCount = 10;
    const batchSize = 2;
    const startingId = 1;
    const notes = createFakeNoteList(noteCount, startingId);
    const routes = openreviewAPIForNotes({ notes, batchSize })
    const spiderRoutes = spiderableRoutes()
    const postResultsToOpenReview = true;

    async function checkCursor(mdb: MongoQueries, role: CursorRole, noteId: string) {
      const c1 = await mdb.getCursor(role);
      expect(c1).toBeDefined()
      if (!c1) {
        throw new Error('checkCursor: undefined');
      }
      expect(c1.noteId).toBe(noteId)
    }

    for await (const __ of withServerGen(r => { routes(r); spiderRoutes(r); })) {
      for await (const { fetchService, mongoose, mdb } of useFetchService({ uniqDB: true, retainDB: false })) {
        // Init the shadow db
        await fetchService.runFetchLoop(100);
        const noteStatusIds = await listNoteStatusIds();
        prettyPrint({ noteStatusIds });

        for await (const { extractionService, taskScheduler } of withExtractionService({ useMongoose: mongoose, postResultsToOpenReview })) {
          // Start from beginning
          await taskScheduler.createUrlCursor('extract-fields/all');
          await checkCursor(mdb, 'extract-fields/all', 'note#1');

          await extractionService.runExtractionLoop(2, false);

          // Next note should be note#3
          await checkCursor(mdb, 'extract-fields/all', 'note#3');

          // Reset to beginning
          await taskScheduler.deleteUrlCursor('extract-fields/all');
          await taskScheduler.createUrlCursor('extract-fields/all');
          await checkCursor(mdb, 'extract-fields/all', 'note#1');

          await taskScheduler.createUrlCursor('extract-fields/newest');
          await checkCursor(mdb, 'extract-fields/newest', 'note#3');

          await extractionService.runExtractionLoop(2, false);
          await checkCursor(mdb, 'extract-fields/newest', 'note#5');
        }
      }
    }

  });

  it.only('should monitor newly extracted fields', async () => {
    for await (const { shadowDB } of useShadowDB({ uniqDB: true })) {
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
