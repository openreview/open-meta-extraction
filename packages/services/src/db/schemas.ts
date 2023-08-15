import _ from 'lodash';

import { CurrentTimeOpt, DefaultCurrentTimeOpt } from './mongodb';
import { getServiceLogger, isUrl } from '@watr/commonlib';
import { Schema, Types, Model, Mongoose, Connection } from 'mongoose';

const log = getServiceLogger('MongoSchema');

export type DBModels = {
  noteStatus: Model<NoteStatus>;
  urlStatus: Model<UrlStatus>;
  fetchCursor: Model<FetchCursor>;
  fieldStatus: Model<FieldStatus>;
}

export function createDBModels(
  mongoose: Connection,
  currTimeOpt?: CurrentTimeOpt): DBModels {
  const timeOpt = currTimeOpt || DefaultCurrentTimeOpt;
  const NoteStatus = () => {
    const schema = new Schema<NoteStatus>({
      id: { type: String, required: true, unique: true },
      number: { type: Number, required: true, unique: true },
      validUrl: { type: Boolean, required: true },
      url: { type: String, required: false },
    }, {
      collection: 'note_status',
      timestamps: timeOpt
    });

    schema.on('index', error => {
      log.error('NoteStatus: indexing', error.message);
    });

    const m =mongoose.model<NoteStatus>('NoteStatus', schema);

    return m;
  }
  const UrlStatus = () => {
    const schema = new Schema<UrlStatus>({
      noteId: { type: String, index: true, unique: true },
      noteNumber: { type: Number, required: true, unique: true },
      hasAbstract: { type: Boolean, required: true },
      hasPdfLink: { type: Boolean, required: true },
      requestUrl: { type: String, required: true, index: true, validate: isUrl },
      validResponseUrl: { type: Boolean, required: false, validate: NonNullable },
      response: { type: String, required: false, },
      responseHost: { type: String, required: false, index: true },
      workflowStatus: { type: String, required: true, index: true, validate: isWorkflowStatus },
      httpStatus: { type: Number, required: false },
    }, {
      collection: 'url_status',
      timestamps: timeOpt
    });

    schema.on('index', error => {
      log.error('UrlStatus: indexing', error.message);
    });
    return mongoose.model<UrlStatus>('UrlStatus', schema);
  }

  const FetchCursor = () => {
    const schema = new Schema<FetchCursor>({
      noteId: { type: String, required: true },
      noteNumber: { type: Number, required: true },
      role: { type: String, required: true, unique: true },
      // lockStatus: { type: String },
    }, {
      collection: 'fetch_cursor',
      timestamps: timeOpt,
    });

    return mongoose.model<FetchCursor>('FetchCursor', schema);
  }

  const FieldStatus = () => {
    const schema = new Schema<FieldStatus>({
      noteId: { type: String },
      fieldType: { type: String, required: true },
      contentHash: { type: String, required: false },
    }, {
      collection: 'field_status',
      timestamps: timeOpt
    });

    // unique on (noteId, fieldType),
    // e.g., ('note#23', 'abstract')
    schema.index({ noteId: 1, fieldType: 1 });

    schema.on('index', error => {
      log.error('FieldStatus: indexing', error.message);
    });

    return mongoose.model<FieldStatus>('FieldStatus', schema);
  }
  return {
    noteStatus: NoteStatus(),
    urlStatus: UrlStatus(),
    fieldStatus: FieldStatus(),
    fetchCursor: FetchCursor(),
  }

}
export interface NoteStatus {
  _id: Types.ObjectId;
  id: string;
  number: number;
  validUrl: boolean;
  url?: string;
  createdAt: Date;
  updatedAt: Date;
}


type WorkflowStatusKeys = {
  unknown: null,
  'processing': null,
  'spider:begun': null,
  'spider:success': null,
  'spider:fail': null,
  'extractor:begun': null,
  'extractor:success': null,
  'extractor:fail': null,
  'fields:selected': null,
  'fields:posted': null,
};

const workflowStatusKeys: WorkflowStatusKeys = {
  unknown: null,
  'processing': null,
  'spider:begun': null,
  'spider:success': null,
  'spider:fail': null,
  'extractor:begun': null,
  'extractor:success': null,
  'extractor:fail': null,
  'fields:selected': null,
  'fields:posted': null,
};

export type WorkflowStatus = keyof WorkflowStatusKeys;
export const WorkflowStatuses: WorkflowStatus[] = _.keys(workflowStatusKeys) as any;

export function isWorkflowStatus(s: unknown): s is WorkflowStatus {
  return typeof s === 'string' && _.includes(WorkflowStatuses, s);
}

export interface UrlStatus {
  _id: Types.ObjectId;
  noteId: string;
  noteNumber: number;
  hasAbstract: boolean;
  hasPdfLink: boolean;
  validResponseUrl: boolean

  requestUrl: string;
  response: string;
  responseHost: string;
  httpStatus: number;
  workflowStatus: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type UrlStatusUpdateFields = Partial<Pick<UrlStatus,
  'hasAbstract'
  | 'hasPdfLink'
  | 'response'
  | 'requestUrl'
  | 'httpStatus'
  | 'workflowStatus'
>>;

function NonNullable(v: unknown): boolean {
  return v !== null;
}


export interface FetchCursor {
  _id: Types.ObjectId;
  noteId: string;
  noteNumber: number;
  role: string;
  // lockStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldStatus {
  noteId: string;
  fieldType: string;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
}
