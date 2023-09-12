/**
 * MongoDB collection creation and Low-level CRUD operations on collections
 */
import _ from 'lodash';
import * as E from 'fp-ts/Either';
import { Document, Types } from 'mongoose';
import {
  getServiceLogger,
  withScopedExec,
  shaEncodeAsHex,
  validateUrl,
  composeScopes,
} from '@watr/commonlib';

import { Logger } from 'winston';

import {
  Task,
  FieldStatus,
  UrlStatus,
  UrlStatusUpdateFields,
  NoteStatus,
  WorkflowStatus,
  DBModels
} from './schemas';

import { MongoDB, mongooseExecScopeWithDeps } from './mongodb';

export type CursorID = Types.ObjectId;
export type UrlStatusDocument = Document<unknown, any, UrlStatus> & UrlStatus;
export type NoteStatusDocument = Document<unknown, any, NoteStatus> & NoteStatus;
export type TaskDocument = Document<unknown, any, Task> & Task;

type upsertNoteStatusArgs = {
  noteId: string,
  urlstr?: string,
  number?: number,
};

type MongoQueriesNeeds = {
  mongoDB: MongoDB;
}

export const mongoQueriesExecScope = () => withScopedExec<
  MongoQueries,
  'mongoQueries',
  MongoQueriesNeeds
>(
  async function init({ mongoDB }) {
    const mongoQueries = new MongoQueries(mongoDB);
    return { mongoQueries };
  }
);

export const mongoQueriesExecScopeWithDeps = () => composeScopes(
  mongooseExecScopeWithDeps(),
  mongoQueriesExecScope()
);


export class MongoQueries {
  log: Logger;
  mongoDB: MongoDB;
  dbModels: DBModels;

  constructor(mongoDB: MongoDB) {
    this.log = getServiceLogger('MongoQueries');
    this.mongoDB = mongoDB;
    this.dbModels = mongoDB.dbModels;
  }

  conn() {
    return this.mongoDB.mongoose;
  }

  async dropDatabase() {
    await this.conn().dropDatabase();
  }

  async createDatabase() {
    await this.dbModels.noteStatus.createCollection();
    await this.dbModels.urlStatus.createCollection();
    // await this.dbModels.taskCursor.createCollection();
    // await this.dbModels.taskCursorX.createCollection();
    await this.dbModels.fieldStatus.createCollection();
  }

  async upsertNoteStatus({
    noteId, urlstr, number
  }: upsertNoteStatusArgs): Promise<NoteStatus> {
    const maybeUrl = validateUrl(urlstr);
    const validUrl = E.isRight(maybeUrl);


    const urlOrErrStr = E.fold<string, URL, string>(
      () => `Invalid URL: ${urlstr}`,
      success => success.toString()
    )(maybeUrl);


    return this.dbModels.noteStatus.findOneAndUpdate(
      { id: noteId },
      { number, validUrl, url: urlOrErrStr },
      { new: true, upsert: true }
    );
  }

  async findNoteStatusById(noteId: string): Promise<NoteStatus | undefined> {
    const ret = await this.dbModels.noteStatus.findOne({ id: noteId });
    return ret === null ? undefined : ret;
  }

  async getLastSavedNote(): Promise<NoteStatus | undefined> {
    const s = await this.dbModels.noteStatus.findOne(
      {}, null, { sort: { number: -1 } }
    );
    return s || undefined;
  }

  async updateUrlStatus(
    noteId: string,
    _fields?: UrlStatusUpdateFields,
  ): Promise<UrlStatusDocument | undefined> {
    const fields = _fields || {};
    const setQ: Record<string, any> = {};
    const unsetQ: Record<string, any> = {};

    _.merge(setQ, fields);

    if ('response' in fields) {
      const { response } = fields;
      const maybeUrl = validateUrl(response);
      const validResponseUrl = E.isRight(maybeUrl);
      _.merge(setQ, { validResponseUrl });

      if (validResponseUrl) {
        const responseHost = maybeUrl.right.hostname;
        _.merge(setQ, { responseHost });
      } else {
        _.merge(unsetQ, { responseHost: '' });
      }
    }

    const updateQ: Record<string, any> = {
      $set: setQ,
      $unset: unsetQ,
    };

    const updated = await this.dbModels.urlStatus.findOneAndUpdate(
      { noteId },
      updateQ,
      { new: true, runValidators: true }
    );
    return updated || undefined;
  }

  async upsertUrlStatus(
    noteId: string,
    noteNumber: number,
    workflowStatus: WorkflowStatus,
    fields: UrlStatusUpdateFields,
  ): Promise<UrlStatusDocument> {
    const setQ: Record<string, any> = {};
    const unsetQ: Record<string, any> = {};

    _.merge(setQ, fields, { workflowStatus, noteNumber });

    if ('response' in fields) {
      const { response } = fields;
      const maybeUrl = validateUrl(response);
      const validResponseUrl = E.isRight(maybeUrl);
      _.merge(setQ, { validResponseUrl });

      if (validResponseUrl) {
        const responseHost = maybeUrl.right.hostname;
        _.merge(setQ, { responseHost });
      } else {
        _.merge(unsetQ, { responseHost: '' });
      }
    }

    const updateQ: Record<string, any> = {
      $set: setQ,
      $unset: unsetQ,
    };

    const updated = await this.dbModels.urlStatus.findOneAndUpdate(
      { noteId },
      updateQ,
      { new: true, upsert: true, runValidators: true }
    );
    return updated || undefined;
  }

  async findUrlStatusById(noteId: string): Promise<UrlStatusDocument | undefined> {
    const ret = await this.dbModels.urlStatus.findOne({ noteId });
    return ret === null ? undefined : ret;
  }

  async upsertFieldStatus(
    noteId: string,
    fieldType: string,
    fieldValue: string,
  ): Promise<FieldStatus> {
    const contentHash = shaEncodeAsHex(fieldValue);
    return this.dbModels.fieldStatus.findOneAndUpdate(
      { noteId, fieldType },
      { fieldType, contentHash },
      { new: true, upsert: true }
    );
  }

  async getFieldStatus(
    noteId: string,
    fieldType: string,
  ): Promise<FieldStatus | undefined> {
    const s = await this.dbModels.fieldStatus.findOne({ noteId, fieldType });
    return s ? s : undefined;
  }
}
