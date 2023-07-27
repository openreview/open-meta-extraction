import _ from 'lodash';

import { getServiceLogger, shaEncodeAsHex } from '@watr/commonlib';

import { Logger } from 'winston';
import { FetchCursor, NoteStatus, WorkflowStatus } from '~/db/schemas';

import {
  MongoQueries,
  UrlStatusDocument,
  WithMongoQueries,
  withMongoQueriesGen,
} from '~/db/query-api';

import { Note, OpenReviewGateway, UpdatableField } from './openreview-gateway';
import { WithMongoGenArgs } from '~/db/mongodb';


export async function createShadowDB(mdb?: MongoQueries): Promise<ShadowDB> {
  const s = new ShadowDB(mdb);
  await s.connect();
  return s;
}
export type WithShadowDB = WithMongoQueries & {
  shadowDB: ShadowDB;
};

export async function* withShadowDB(args: WithMongoGenArgs): AsyncGenerator<WithShadowDB, void, any> {
  for await (const { mongoose, mdb } of withMongoQueriesGen(args)) {
    const shadowDB = await createShadowDB(mdb);
    yield { mongoose, mdb, shadowDB };
  }
}

export class ShadowDB {
  log: Logger;
  gate: OpenReviewGateway;
  mdb: MongoQueries;

  constructor(mdb?: MongoQueries) {
    this.log = getServiceLogger('ShadowDB');
    this.gate = new OpenReviewGateway();
    this.mdb = mdb || new MongoQueries();
  }

  async connect() {
    await this.mdb.connect();
  }

  async close() {
    await this.mdb.close();
  }

  async updateFieldStatus(
    noteId: string,
    fieldName: UpdatableField,
    fieldValue: string,
  ): Promise<void> {
    const priorStatus = await this.mdb.getFieldStatus(noteId, fieldName);
    const newFieldValueHash = shaEncodeAsHex(fieldValue);
    const fieldIsUnchanged = priorStatus && priorStatus.contentHash === newFieldValueHash;

    if (fieldIsUnchanged) {
      this.log.info(`Updating note ${noteId}: ${fieldName} is unchanged`)
      return;
    }

    await this.mdb.upsertFieldStatus(
      noteId,
      fieldName,
      fieldValue
    );
    await this.gate.updateFieldStatus(noteId, fieldName, fieldValue);
  }

  async getUrlStatusForCursor(cursor: FetchCursor): Promise<UrlStatusDocument | undefined> {
    return this.mdb.findUrlStatusById(cursor.noteId);
  }

  async findNote(noteId: string): Promise<NoteStatus | undefined> {
    return this.mdb.findNoteStatusById(noteId);
  }

  async saveNote(note: Note, upsert: boolean): Promise<void> {
    const urlstr = note.content.html;
    const existingNote = await this.mdb.findNoteStatusById(note.id);
    const noteExists = existingNote !== undefined;
    if (noteExists && !upsert) {
      this.log.info('SaveNote: note already exists, skipping');
      return;
    }

    this.log.info(`SaveNote: ${noteExists ? 'overwriting' : 'creating new'} Note<id:${note.id}, #${note.number}>`);

    const noteStatus = await this.mdb.upsertNoteStatus({ noteId: note.id, number: note.number, urlstr });
    if (!noteStatus.validUrl) {
      this.log.debug('SaveNote: no valid url.');
      return;
    }
    const requestUrl = noteStatus.url;
    if (requestUrl === undefined) {
      this.log.error(`Invalid state: NoteStatus(${note.id}).validUrl===true, url===undefined`);
      return;
    }

    const abs = note.content.abstract;
    const pdfLink = note.content.pdf;
    const hasAbstract = typeof abs === 'string';
    const hasPdfLink = typeof pdfLink === 'string';
    const status: WorkflowStatus = hasAbstract && hasPdfLink ? 'extractor:success' : 'unknown';
    await this.mdb.upsertUrlStatus(note.id, note.number, status, { hasAbstract, hasPdfLink, requestUrl });

    if (hasAbstract) {
      await this.mdb.upsertFieldStatus(note.id, 'abstract', abs);
    }
    if (hasPdfLink) {
      await this.mdb.upsertFieldStatus(note.id, 'pdf', pdfLink);
    }
  }

  async updateLastFetchedNote(noteId: string): Promise<FetchCursor> {
    return this.mdb.updateCursor('fetch-openreview-notes', noteId);
  }

  async getLastFetchedNote(): Promise<FetchCursor | undefined> {
    return this.mdb.getCursor('fetch-openreview-notes');
  }

}
