import _ from 'lodash';
import { setLogEnvLevel } from '@watr/commonlib';

import { withServerGen } from '@watr/spider';
import { withFetchService } from './fetch-service';

import { createFakeNoteList, createFakeNotes } from '~/db/mock-data';
import { fakeNoteIds, listNoteStatusIds, openreviewAPIForNotes } from './testing-utils';

describe('Fetch Service', () => {

  setLogEnvLevel('info');

  it('should create valid fake notes', async () => {
    const notes = createFakeNotes(3);
    expect(notes.notes[0]).toMatchObject({ id: 'note#1', number: 1 });
    expect(notes.notes[2]).toMatchObject({ id: 'note#3', number: 3 });

    expect(createFakeNotes(2, 2).notes)
      .toMatchObject([{ id: 'note#2', number: 2 }, { id: 'note#3', number: 3 }]);
  });

  it.only('should repeatedly start from last know fetched note', async () => {
    const noteCount = 5;
    const batchSize = 2;
    const notes = createFakeNoteList(noteCount, 1);
    const routes = openreviewAPIForNotes({ notes, batchSize })

    for await (const __ of withServerGen(routes)) {
      for await (const { fetchService } of withFetchService({ uniqDB: true })) {
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
  });

});
