import _ from 'lodash';
import { ConfigProvider, asyncEachOfSeries } from '@watr/commonlib';
import * as fc from 'fast-check';
import { MongoQueries } from './query-api';
import { WorkflowStatuses } from './schemas';
import { Note, Notes } from '~/components/openreview-gateway';

export async function populateDBHostNoteStatus(mdb: MongoQueries, n: number) {
  await asyncEachOfSeries(
    _.range(n),
    async (noteNumber: number) => {
      const validUrl = noteNumber % 3 === 0;
      const urlstr = validUrl ? `http://host-${noteNumber % 5}/page/${noteNumber}` : 'no-url';
      await mdb.upsertNoteStatus({
        noteId: `note#${noteNumber}`,
        number: noteNumber,
        urlstr
      });

      const wi = noteNumber % WorkflowStatuses.length;
      const workflowStatus = WorkflowStatuses[wi];
      if (validUrl) {
        const httpStatus = (((noteNumber % 4) + 2) * 100) + (noteNumber % 3);
        await mdb.upsertUrlStatus(
          `note#${noteNumber}`,
          noteNumber,
          workflowStatus,
          {
            hasAbstract: noteNumber % 9 === 0,
            requestUrl: urlstr,
            response: urlstr,
            httpStatus
          });
      }
    }
  );
}
const a200s = Array(20).fill(200);
const a404s = Array(4).fill(200);
const aCodes = _.concat(a200s, a404s, [301, 302, 500]);
export const genHttpStatus = fc.oneof(
  ...(aCodes.map(n => fc.constant(n)))
);

export const numberSeries = (start: number, end?: number) =>
  fc.Stream.of<number>(... _.range(start, end));

type CreateFakeNote = {
  config: ConfigProvider;
  noteNumber: number;
  hasAbstract: boolean;
  hasHTMLLink: boolean;
  hasPDFLink: boolean;
};

export function createFakeNote({
  config,
  noteNumber,
  hasAbstract,
  hasHTMLLink,
  hasPDFLink,
}: CreateFakeNote): Note {
  const baseUrl = config.get('openreview:restApi');
  const number = noteNumber;
  const minutes = noteNumber.toString().padStart(2, '0');
  const inputStr = `2023-07-10T18:${minutes}:12.629Z`;
  const date = new Date(inputStr);
  const dateAsNum = date.getTime();
  const abs = hasAbstract ? `Abstract: Paper ${number} description...` : undefined;
  const pdf = hasPDFLink ? `${baseUrl}/pdf/paper-${number}.pdf` : undefined;
  const html = hasHTMLLink ? `${baseUrl}/html/${number}` : undefined;

  return {
    id: `note#${number}`,
    number,
    cdate: dateAsNum,
    mdate: dateAsNum,
    tcdate: dateAsNum,
    tmdate: dateAsNum,
    content: {
      abstract: abs,
      pdf, // URL of PDF
      html, // URL for paper landing page
      venueid: '',
      title: `Research Paper ${number}`,
      authors: ['Adam Smith'],
      tcdate: 0,
      authorids: ['~asmith1;'],
      venue: '',
      _bibtex: '',
    }
  };
}

export function createFakeNoteList(config: ConfigProvider, count: number, startingNumber: number = 1): Note[] {
  const ids = _.range(startingNumber, startingNumber + count);
  return _.map(ids, (i) => createFakeNote({
    config,
    noteNumber: i,
    hasAbstract: false,
    hasPDFLink: false,
    hasHTMLLink: true
  }));
}

export function asNoteBatch(count: number, notes: Note[]): Notes {
  return {
    count,
    notes
  };
}

export function createFakeNotes(config: ConfigProvider, count: number, startingNumber: number = 1): Notes {
  const notes = createFakeNoteList(config, count, startingNumber);
  return asNoteBatch(count, notes);
}
