
import _ from 'lodash';
import { setLogEnvLevel } from '@watr/commonlib';

import { withServerGen } from '@watr/spider';
import { withFetchService } from './fetch-service';
import { createFakeNoteList } from '~/db/mock-data';
import { openreviewAPIForNotes } from './testing-utils';
import { withExtractionService } from './extraction-service';

describe('Extraction Service', () => {

  setLogEnvLevel('debug');

  it('...', async () => {
    const noteCount = 5;
    const batchSize = 2;
    const notes = createFakeNoteList(noteCount, 1);
    const routes = openreviewAPIForNotes({ notes, batchSize })
    const postResultsToOpenReview = true;

    for await (const __ of withServerGen(routes)) {
      for await (const { fetchService, mongoose } of withFetchService({ uniqDB: true })) {
        // Init the shadow db
        await fetchService.runFetchLoop(100);

        for await (const { extractionService } of withExtractionService({ useMongoose: mongoose, postResultsToOpenReview })) {
          await extractionService.runExtractionLoop(1);
        }
      }

    }



  });
});
