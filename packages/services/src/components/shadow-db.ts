import _ from 'lodash';

import { getServiceLogger, withScopedExec, shaEncodeAsHex, composeScopes, isTestingEnv } from '@watr/commonlib';

import { Logger } from 'winston';
import { TaskCursor, NoteStatus, WorkflowStatus } from '~/db/schemas';

import {
  MongoQueries,
  UrlStatusDocument,
  mongoQueriesExecScopeWithDeps
} from '~/db/query-api';

import { Note, OpenReviewGateway, UpdatableField } from './openreview-gateway';
import { MongoDBNeeds, mongoConfig } from '~/db/mongodb';


export type ShadowDBNeeds = {
  mongoQueries: MongoQueries,
  writeChangesToOpenReview: boolean;
};

export const shadowDBExecScope = () => withScopedExec<
  ShadowDB,
  'shadowDB',
  ShadowDBNeeds
>(
  async function init(needs: ShadowDBNeeds) {
    const shadowDB = new ShadowDB(needs);
    return { shadowDB };
  },
  async function destroy() {
  },
);

export const shadowDBExecScopeWithDeps = () => composeScopes(
  mongoQueriesExecScopeWithDeps(),
  shadowDBExecScope()
);


export class ShadowDB {
  log: Logger;
  gate: OpenReviewGateway;
  mongoQueries: MongoQueries;
  writeChangesToOpenReview: boolean;

  constructor(needs: ShadowDBNeeds) {
    const { mongoQueries, writeChangesToOpenReview } = needs;
    this.log = getServiceLogger('ShadowDB');
    this.gate = new OpenReviewGateway(mongoQueries.mongoDB.config);
    this.mongoQueries = mongoQueries;
    this.writeChangesToOpenReview = writeChangesToOpenReview;
  }


  async updateFieldStatus(
    noteId: string,
    fieldName: UpdatableField,
    fieldValue: string,
  ): Promise<void> {
    const priorStatus = await this.mongoQueries.getFieldStatus(noteId, fieldName);
    const newFieldValueHash = shaEncodeAsHex(fieldValue);
    const fieldIsUnchanged = priorStatus && priorStatus.contentHash === newFieldValueHash;

    if (fieldIsUnchanged) {
      this.log.info(`Updating note ${noteId}: ${fieldName} is unchanged`)
      return;
    }

    await this.mongoQueries.upsertFieldStatus(
      noteId,
      fieldName,
      fieldValue
    );
    if (this.writeChangesToOpenReview) {
      await this.gate.updateFieldStatus(noteId, fieldName, fieldValue);
    }
  }

  async getUrlStatusForCursor(cursor: TaskCursor): Promise<UrlStatusDocument | undefined> {
    return this.mongoQueries.findUrlStatusById(cursor.noteId);
  }

  async findNote(noteId: string): Promise<NoteStatus | undefined> {
    return this.mongoQueries.findNoteStatusById(noteId);
  }

  async saveNote(note: Note, upsert: boolean): Promise<void> {
    const urlstr = note.content.html;
    const existingNote = await this.mongoQueries.findNoteStatusById(note.id);
    const noteExists = existingNote !== undefined;
    if (noteExists && !upsert) {
      this.log.info('SaveNote: note already exists, skipping');
      return;
    }

    this.log.info(`SaveNote: ${noteExists ? 'overwriting' : 'creating new'} Note<id:${note.id}, #${note.number}>`);

    const noteStatus = await this.mongoQueries.upsertNoteStatus({ noteId: note.id, number: note.number, urlstr });
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
    await this.mongoQueries.upsertUrlStatus(note.id, note.number, status, { hasAbstract, hasPdfLink, requestUrl });

    if (hasAbstract) {
      await this.mongoQueries.upsertFieldStatus(note.id, 'abstract', abs);
    }
    if (hasPdfLink) {
      await this.mongoQueries.upsertFieldStatus(note.id, 'pdf', pdfLink);
    }
  }
}

export function shadowDBConfig(): MongoDBNeeds & Omit<ShadowDBNeeds, 'mongoQueries'> {
  const config = mongoConfig();

  const isTest = isTestingEnv();
  const shadowConfig: Omit<ShadowDBNeeds, 'mongoQueries'> = {
    writeChangesToOpenReview: !isTest
  };
  return {
    ...config,
    ...shadowConfig
  };
}
