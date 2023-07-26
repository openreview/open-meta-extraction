
import _ from 'lodash';
import { setLogEnvLevel } from '@watr/commonlib';

setLogEnvLevel('info');

import { withServerGen } from '@watr/spider';
import { createFetchService } from './fetch-service';

import { FetchCursor, UrlStatus, NoteStatus } from '~/db/schemas';
import { createFakeNotes } from '~/db/mock-data';
import { openreviewAPIRoutes } from './testing-utils';
import { withMongoGen } from '~/db/mongodb';
import { createShadowDB } from './shadow-db';
import { createMongoQueries } from '~/db/query-api';


describe('Fetch Service', () => {

  it('should create valid fake notes', async () => {
    const notes = createFakeNotes(3);
    expect(notes.notes[0]).toMatchObject({ id: 'note#1', number: 1 });
    expect(notes.notes[2]).toMatchObject({ id: 'note#3', number: 3 });

    expect(createFakeNotes(2, 2).notes)
      .toMatchObject([{ id: 'note#2', number: 2 }, { id: 'note#3', number: 3 }]);
  });

  it('should run fetch loop with cursor', async () => {
    const fourNoteIds = _.range(4).map(i => `note#${i + 1}`);
    const eightNoteIds = _.range(8).map(i => `note#${i + 1}`);

    for await (const __ of withServerGen(openreviewAPIRoutes)) {
      for await (const mongoose of withMongoGen({ uniqDB: true })) {
        // instantiate fetch service w/ our own server connection mongoose/mdb
        const mdb = await createMongoQueries(mongoose);
        const shadow = await createShadowDB(mdb)
        const fetchService = await createFetchService(shadow);
        await fetchService.runFetchLoop(4);

        // assert MongoDB is populated correctly
        let notes = await NoteStatus.find();
        expect(notes.map(n => n.id)).toMatchObject(fourNoteIds);

        let cursors = await FetchCursor.find();
        expect(cursors.map(n => n.noteId)).toMatchObject(['note#4']);
        let hosts = await UrlStatus.find();
        expect(hosts.map(n => n.noteId)).toMatchObject(fourNoteIds);


        await fetchService.runFetchLoop(4);

        notes = await NoteStatus.find();
        expect(notes.map(n => n.id)).toMatchObject(eightNoteIds);

        cursors = await FetchCursor.find();
        expect(cursors.map(n => n.noteId)).toMatchObject(['note#8']);
        hosts = await UrlStatus.find();
        expect(hosts.map(n => n.noteId)).toMatchObject(eightNoteIds);
      }
    }
  });
});
