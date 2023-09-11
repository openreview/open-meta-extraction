import _ from 'lodash';
import { ConfigProvider, asyncEachOfSeries } from '@watr/commonlib';
import * as fc from 'fast-check';
import { MongoQueries } from './query-api';
import { WorkflowStatuses } from './schemas';
import { Note, Notes } from '~/components/openreview-gateway';
import { Schema, Types, Model } from 'mongoose';
import { MongoDB } from './mongodb';

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
  fc.Stream.of<number>(..._.range(start, end));

type CreateFakeNote = {
  config: ConfigProvider;
  noteNumber: number;
  hasAbstract?: string;
  hasHTMLLink: boolean;
  hasPDFLink?: string;
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

type Freq = [number, number];
export type FieldFrequencies = {
  validHtmlLinkFreq: Freq;
  abstractFreq: Freq;
  pdfLinkFreq: Freq;
}
function fieldOccurs(freq: Freq, n: number): boolean {
  const [occurs, outOf] = freq;
  return (n % outOf) < occurs;
}

type ToBool<T> = {
  [P in keyof T]: boolean
}

function rec(k: string, v: boolean): Record<string, boolean> {
  const r: Record<string, boolean> = {};
  r[k] = v
  return r;
}

function fieldsOccur(fieldFreqs: FieldFrequencies, n: number): ToBool<FieldFrequencies> {
  const freqPairs: Record<string, boolean>[] = _.map(
    _.toPairs(fieldFreqs),
    ([k, v]) => rec(k, fieldOccurs(v, n))
  );
  return _.merge({}, ...freqPairs);
}
export function createFakeNoteList(config: ConfigProvider, count: number, fieldFrequencies: FieldFrequencies, startingNumber: number = 1): Note[] {
  const ids = _.range(startingNumber, startingNumber + count);

  return _.map(ids, (i) => {
    const occurances = fieldsOccur(fieldFrequencies, i-startingNumber);
    const hasHTMLLink = occurances.validHtmlLinkFreq;
    const hasAbstract = hasHTMLLink && occurances.abstractFreq? 'Abstract #': undefined;
    const hasPDFLink = hasHTMLLink && occurances.pdfLinkFreq? 'http://foo.bar/paper' : undefined;

    return createFakeNote({
      config,
      noteNumber: i,
      hasAbstract,
      hasPDFLink,
      hasHTMLLink
    });

  });
}

export function asNoteBatch(count: number, notes: Note[]): Notes {
  return {
    count,
    notes
  };
}

export function createFakeNotes(config: ConfigProvider, count: number, startingNumber: number = 1): Notes {
  const fieldFrequencies: FieldFrequencies = {
    validHtmlLinkFreq: [4, 5],
    abstractFreq: [1, 2],
    pdfLinkFreq: [1, 3]
  };
  const notes = createFakeNoteList(config, count, fieldFrequencies, startingNumber);
  return asNoteBatch(count, notes);
}

// Fake collection for testing
export interface MyColl {
  _id: Types.ObjectId;
  number: number;
  isValid: boolean;
}

export async function initMyColl(mongoDB: MongoDB): Promise<Model<MyColl>> {
  const schema = new Schema<MyColl>({
    number: { type: Number, required: true, unique: true },
    isValid: { type: Boolean, required: true },
  }, {
    collection: 'my_coll',
  });

  const model = mongoDB.mongoose.model<MyColl>('MyColl', schema);
  await model.createCollection();
  return model
}
