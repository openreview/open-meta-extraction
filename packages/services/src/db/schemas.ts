import _ from 'lodash';

import { CurrentTimeOpt, DefaultCurrentTimeOpt } from './mongodb';
import { getServiceLogger, isUrl } from '@watr/commonlib';
import { Schema, Types, Model, Connection, PipelineStage, FilterQuery } from 'mongoose';


const log = getServiceLogger('MongoSchema');

export type DBModels = {
  noteStatus: Model<NoteStatus>;
  urlStatus: Model<UrlStatus>;
  // taskCursor: Model<TaskCursor>;
  // taskCursorX: Model<TaskCursorX>;
  task: Model<Task>;
  fieldStatus: Model<FieldStatus>;
}

export function defineDBModels(
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

    const m = mongoose.model<NoteStatus>('NoteStatus', schema);

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

  const Task = () => {
    const schema = new Schema<Task>({
      taskName: { type: String, required: true, unique: true },
      collectionName: { type: String, required: true },
      runStatus: { type: String, required: true },
      matchLast: { type: Schema.Types.Mixed, required: true },
      matchNext: { type: Schema.Types.Mixed, required: true },
      cursorField: { type: String, required: true },
      cursorValue: { type: Number, required: true },
    }, {
      collection: 'task',
      timestamps: timeOpt,
    });

    return mongoose.model<Task>('Task', schema);
  }

  // const TaskCursorX = () => {
  //   const schema = new Schema<TaskCursorX>({
  //     noteId: { type: String, required: true },
  //     noteNumber: { type: Number, required: true },
  //     taskName: { type: String, required: true },
  //     lockStatus: { type: String, required: true },
  //     // taskName: { type: String }, 'extract-grobid/new|all|amend', 'extract-html/new|all|amend'
  //     // lockStatus: { type: String }, 'next', 'locked:#id-of-holder', 'complete', 'last', 'begin'
  //   }, {
  //     collection: 'task_cursor_x',
  //     timestamps: timeOpt,
  //   });
  //   schema.index({ taskName: 1, lockStatus: 1 });

  //   return mongoose.model<TaskCursorX>('TaskCursorX', schema);
  // }

  // const TaskCursor = () => {
  //   const schema = new Schema<TaskCursor>({
  //     noteId: { type: String, required: true },
  //     noteNumber: { type: Number, required: true },
  //     role: { type: String, required: true, unique: true },
  //   }, {
  //     collection: 'task_cursor',
  //     timestamps: timeOpt,
  //   });

  //   return mongoose.model<TaskCursor>('TaskCursor', schema);
  // }

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
    // taskCursor: TaskCursor(),
    // taskCursorX: TaskCursorX(),
    task: Task(),
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


// export interface TaskCursor {
//   _id: Types.ObjectId;
//   noteId: string;
//   noteNumber: number;
//   role: string;
//   createdAt: Date;
//   updatedAt: Date;
// }

type TaskRunStatus = 'uninitialized' | 'running';

export interface Task {
  _id: Types.ObjectId;
  taskName: string;
  runStatus: TaskRunStatus;
  collectionName: string;
  matchLast: FilterQuery<any>;
  matchNext: FilterQuery<any>;
  cursorField: string;
  cursorValue: number;
}

// export interface TaskCursorX {
//   _id: Types.ObjectId;
//   noteId: string;
//   noteNumber: number;
//   taskName: string;
//   lockStatus: string;
//   createdAt: Date;
//   updatedAt: Date;
// }

export interface FieldStatus {
  noteId: string;
  fieldType: string;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
}
