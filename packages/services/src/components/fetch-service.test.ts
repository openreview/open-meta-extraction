import _ from 'lodash';
import { asyncEachSeries, prettyPrint, setLogEnvLevel } from '@watr/commonlib';

import { withHttpTestServer } from '@watr/spider';
import { fetchServiceExecScopeWithDeps, fetchServiceMonitor } from './fetch-service';

import { createFakeNoteList, createFakeNotes } from '~/db/mock-data';
import { fakeNoteIds, listNoteStatusIds, openreviewAPIForNotes } from './testing-utils';
import { shadowDBExecScopeWithDeps, shadowDBTestConfig } from './shadow-db';

describe('Fetch Service', () => {

  setLogEnvLevel('info');

  it('should create valid fake notes', async () => {
    const shadowDBConfig = shadowDBTestConfig();
    const config = shadowDBConfig.config;
    const notes = createFakeNotes(config, 3);
    expect(notes.notes[0]).toMatchObject({ id: 'note#1', number: 1 });
    expect(notes.notes[2]).toMatchObject({ id: 'note#3', number: 3 });

    expect(createFakeNotes(config, 2, 2).notes)
      .toMatchObject([{ id: 'note#2', number: 2 }, { id: 'note#3', number: 3 }]);
  });

  it('should repeatedly start from last know fetched note', async () => {
    const shadowDBConfig = shadowDBTestConfig();
    const config = shadowDBConfig.config;
    const noteCount = 5;
    const batchSize = 2;
    const notes = createFakeNoteList(config, noteCount, 1);
    const routerSetup = openreviewAPIForNotes({ notes, batchSize })

    for await (const {} of withHttpTestServer({ config, routerSetup })) {
      for await (const { fetchService, } of fetchServiceExecScopeWithDeps()(shadowDBConfig)) {
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

  it('should monitor and report progress', async () => {
    const shadowDBConfig = shadowDBTestConfig();
    const config = shadowDBConfig.config;
    const noteCount = 50;
    const notes = createFakeNoteList(config, noteCount, 1);

    for await (const { shadowDB } of shadowDBExecScopeWithDeps()(shadowDBConfig)) {
      await asyncEachSeries(notes, n => shadowDB.saveNote(n, true))
      const summary = await fetchServiceMonitor();
      prettyPrint({ summary })
    }
  });

});
