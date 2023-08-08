import _ from 'lodash';
import { asyncEachSeries, prettyPrint, scopedGracefulExit, setLogEnvLevel } from '@watr/commonlib';

import { scopedHttpServer } from '@watr/spider';
import { fetchServiceMonitor, scopedFetchService } from './fetch-service';

import { createFakeNoteList, createFakeNotes } from '~/db/mock-data';
import { fakeNoteIds, listNoteStatusIds, openreviewAPIForNotes } from './testing-utils';
import { scopedShadowDB } from './shadow-db';
import { scopedMongoose } from '~/db/mongodb';
import { scopedMongoQueries } from '~/db/query-api';

describe('Fetch Service', () => {

  setLogEnvLevel('info');

  it('should create valid fake notes', async () => {
    const notes = createFakeNotes(3);
    expect(notes.notes[0]).toMatchObject({ id: 'note#1', number: 1 });
    expect(notes.notes[2]).toMatchObject({ id: 'note#3', number: 3 });

    expect(createFakeNotes(2, 2).notes)
      .toMatchObject([{ id: 'note#2', number: 2 }, { id: 'note#3', number: 3 }]);
  });

  it('should repeatedly start from last know fetched note', async () => {
    const noteCount = 5;
    const batchSize = 2;
    const notes = createFakeNoteList(noteCount, 1);
    const routerSetup = openreviewAPIForNotes({ notes, batchSize })

    const port = 9100;
    for await (const { gracefulExit } of scopedGracefulExit.use({})) {
      for await (const {} of scopedHttpServer.use({ gracefulExit, port, routerSetup })) {
        for await (const { mongoose } of scopedMongoose.use({ uniqDB: true })) {
          for await (const { mongoQueries } of scopedMongoQueries.use({ mongoose })) {
            for await (const { shadowDB } of scopedShadowDB.use({ mongoQueries })) {
              for await (const { fetchService } of scopedFetchService.use({ shadowDB })) {
                expect(await listNoteStatusIds()).toHaveLength(0);
                // get 1
                await fetchService.runFetchLoop(1);
                expect(await listNoteStatusIds()).toMatchObject(fakeNoteIds(1, 1));

                // get 2
                await fetchService.runFetchLoop(1);
                expect(await listNoteStatusIds()).toMatchObject(fakeNoteIds(1, 2));

                // get 3-5
                await fetchService.runFetchLoop(3);
                expect(await listNoteStatusIds()).toMatchObject(fakeNoteIds(1, 5));

                // get w/none left
                await fetchService.runFetchLoop(3);
                expect(await listNoteStatusIds()).toMatchObject(fakeNoteIds(1, 5));
              }
            }
          }
        }
      }
    }
  });

  it.only('should monitor and report progress', async () => {
    const noteCount = 50;
    const notes = createFakeNoteList(noteCount, 1);

    for await (const { mongoose } of scopedMongoose.use({ uniqDB: true })) {
      for await (const { mongoQueries } of scopedMongoQueries.use({ mongoose })) {
        for await (const { shadowDB } of scopedShadowDB.use({ mongoQueries })) {
          await asyncEachSeries(notes, n => shadowDB.saveNote(n, true))
          const summary = await fetchServiceMonitor();
          prettyPrint({ summary })
        }
      }
    }
  });

});
