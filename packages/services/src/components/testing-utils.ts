import _ from 'lodash';

import { respondWith } from '@watr/spider';
import { asNoteBatch, createFakeNoteList } from '~/db/mock-data';
import Router from '@koa/router';

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

