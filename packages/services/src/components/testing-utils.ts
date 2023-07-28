import _ from 'lodash';

import { respondWith } from '@watr/spider';
import { asNoteBatch, createFakeNoteList } from '~/db/mock-data';
import Router from '@koa/router';
import { Note } from './openreview-gateway';
import { NoteStatus } from '~/db/schemas';

// Router that creates an infinite # of fake note batches for use in testing
//
// Notes are all sequentially ordered:
//  e.g., { id: 'note#3', number: 3, content:{ ... } }
//        { id: 'note#4', number: 4, content:{ ... } }
export function openreviewAPIRoutes(router: Router) {
  router.post('/login', respondWith({ token: 'fake-token', user: { id: '~TestUser;' } }));

  const totalNotes = 100;
  const batchSize = 10;
  router.get('/notes', (ctx) => {
    const { query } = ctx;
    const { after } = query;
    let prevIdNum = 0;
    if (_.isString(after)) {
      const idnum = after.split('#')[1];
      prevIdNum = Number.parseInt(idnum, 10);
    }
    const noteList = createFakeNoteList(batchSize, prevIdNum + 1);
    respondWith(asNoteBatch(totalNotes, noteList))(ctx);
  });
}

type OpenreviewAPIForNotes = {
  notes: Note[];
  batchSize: number;
}

export function openreviewAPIForNotes({ notes, batchSize }: OpenreviewAPIForNotes) {
  function routes(router: Router) {
    router.post('/login', respondWith({ token: 'fake-token', user: { id: '~TestUser;' } }));
    const noteCollections = _.clone(notes);
    const totalNotes = notes.length;
    router.get('/notes', (ctx) => {
      const { query } = ctx;
      const { after } = query;
      let begin = 0;
      let end = batchSize;
      if (_.isString(after)) {
        const noteIndex = noteCollections.findIndex((note) => {
          return note.id === after;
        });
        if (noteIndex===-1) {
          end = 0
        } else {
          begin = noteIndex+1;
          end = begin + batchSize;
        }
      }

      const toReturn = noteCollections.slice(begin, end);
      respondWith(asNoteBatch(totalNotes, toReturn))(ctx);
    });
  }

  return routes;
}

export async function listNoteStatuses(): Promise<NoteStatus[]> {
  return NoteStatus.find();
}

export function fakeNoteIds(firstId: number, lastId: number): string[] {
  return _.range(firstId, lastId+1).map(i => `note#${i}`);
}
export async function listNoteStatusIds(): Promise<string[]> {
  const notes = await listNoteStatuses();
  return notes.map(n => n.id)
}
