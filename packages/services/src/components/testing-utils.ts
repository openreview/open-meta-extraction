import _ from 'lodash';

import { respondWithJson, respondWithHtml } from '@watr/spider';
import { asNoteBatch } from '~/db/mock-data';
import Router from '@koa/router';
import { Note } from './openreview-gateway';
import { NoteStatus } from '~/db/schemas';
import { stripMargin } from '@watr/commonlib';


type OpenreviewAPIForNotes = {
  notes: Note[];
  batchSize: number;
}

export function openreviewAPIForNotes({ notes, batchSize }: OpenreviewAPIForNotes) {
  function routes(router: Router) {
    router.post('/login', respondWithJson({ token: 'fake-token', user: { id: '~TestUser;' } }));
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
        if (noteIndex === -1) {
          end = 0
        } else {
          begin = noteIndex + 1;
          end = begin + batchSize;
        }
      }

      const toReturn = noteCollections.slice(begin, end);
      respondWithJson(asNoteBatch(totalNotes, toReturn))(ctx);
    });

    router.post('/notes', (ctx) => {
      const anyReq = (ctx.request) as any;

      const body: any = anyReq.body;
      const { referent } = body
      respondWithJson({ id: referent })(ctx)
    });
  }

  return routes;
}

export async function listNoteStatuses(): Promise<NoteStatus[]> {
  return NoteStatus.find();
}

export function fakeNoteIds(firstId: number, lastId: number): string[] {
  return _.range(firstId, lastId + 1).map(i => `note#${i}`);
}
export async function listNoteStatusIds(): Promise<string[]> {
  const notes = await listNoteStatuses();
  return notes.map(n => n.id)
}


function mockSpiderableHtml(noteNumber: string) {
  const htmlText = stripMargin(`
|<html>
|  <head>
|    <meta name="citation_author" content="Holte, Robert C." />
|    <meta name="citation_author" content="Burch, Neil" />
|    <meta name="citation_title" content="Paper ${noteNumber}: Sed ut perspiciatis" />
|    <meta name="citation_pdf_url" content="/papers/paper${noteNumber}.pdf" />
|  </head>
|
|  <body>
|    <section class="abstract">
|      Abstract: For Paper #${noteNumber}
|      Sed  ut perspiciatis  unde omnis  iste natus  error sit  voluptatem accusantium
|       doloremque laudantium,  totam rem  aperiam, eaque ipsa  quae ab  illo inventore
|       veritatis et quasi architecto beatae vitae dicta sunt explicabo.
|    </section>
|  </body>
|</html>
`);
  return htmlText;
}

export function spiderableRoutes() {
  function routes(router: Router) {
    router.get('/html/:id', (ctx) => {
      const id = ctx.params['id'];
      respondWithHtml(mockSpiderableHtml(id))(ctx)
    });
  }
  return routes;
}
