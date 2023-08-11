import _ from 'lodash';

import { getServiceLogger, withScopedResource, shaEncodeAsHex, combineScopedResources, ConfigProvider } from '@watr/commonlib';

import { Logger } from 'winston';
import { FetchCursor, NoteStatus, WorkflowStatus } from '~/db/schemas';

import {
  MongoQueries,
  UrlStatusDocument,
  scopedMongoQueriesWithDeps
} from '~/db/query-api';

import { Note, OpenReviewGateway, UpdatableField } from './openreview-gateway';


type ShadowDBNeeds = {
  mongoQueries: MongoQueries,
  config: ConfigProvider
};

export const scopedShadowDB = () => withScopedResource<
  ShadowDB,
  'shadowDB',
  ShadowDBNeeds
>(
  'shadowDB',
  async function init({ mongoQueries, config }) {
    const shadowDB = new ShadowDB(mongoQueries, config);
    return { shadowDB };
  },
  async function destroy() {
  },
);

export const scopedShadowDBWithDeps = () => combineScopedResources(
  scopedMongoQueriesWithDeps(),
  scopedShadowDB()
);


export class ShadowDB {
  log: Logger;
  gate: OpenReviewGateway;
  mdb: MongoQueries;
  writeChangesToOpenReview: boolean;
  config: ConfigProvider;

  constructor(
    mdb: MongoQueries,
    config: ConfigProvider
  ) {
    this.log = getServiceLogger('ShadowDB');
    this.gate = new OpenReviewGateway(config);
    this.mdb = mdb;
    this.writeChangesToOpenReview = true;
    this.config = config;
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
    if (this.writeChangesToOpenReview) {
      await this.gate.updateFieldStatus(noteId, fieldName, fieldValue);
    }
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
}
