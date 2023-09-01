import _ from 'lodash';
import { Logger } from 'winston';
import { Model, Types } from 'mongoose';
import { MongoDB } from './mongodb';

import {
  getServiceLogger, prettyPrint, withScopedExec,
} from '@watr/commonlib';

import { PipelineStage } from 'mongoose';

import {
  DBModels,
  Task
} from './schemas';

export type CursorID = Types.ObjectId;

export type CursorRole =
  'extract-fields/newest'
  | 'extract-fields/all'
  ;

export const CursorRoles: CursorRole[] = [
  'extract-fields/newest',
  'extract-fields/all'
];

export function isCursorRole(s: unknown): s is CursorRole {
  return typeof s === 'string' && _.includes(CursorRoles, s)
}

export type TaskCursorNeeds = {
  mongoDB: MongoDB;
}

export const taskCursorExecScope = () => withScopedExec<TaskCursors, 'taskCursors', TaskCursorNeeds>(
  async function init({ mongoDB }) {
    const taskCursors = new TaskCursors(mongoDB);
    return { taskCursors };
  },
  async function destroy({ mongoDB }) {
  }
)


export class TaskCursors {
  log: Logger;
  mongoDB: MongoDB;
  dbModels: DBModels;

  constructor(mongoDB: MongoDB) {
    this.log = getServiceLogger('TaskCursors');
    this.mongoDB = mongoDB;
    this.dbModels = mongoDB.dbModels;
  }

  conn() {
    return this.mongoDB.mongoose;
  }

  async defineTask<M>(
    taskName: string,
    model: Model<M>,
    cursorField: string,
    initCursorValue: number,
    matchFilter?: PipelineStage.Match
  ): Promise<Task> {
    const collectionName = model.collection.name;
    const match = matchFilter? matchFilter : { $match: { _id: true } };
    const created = await this.dbModels.task.create({
      taskName,
      collectionName,
      match,
      cursorField,
      cursorValue: initCursorValue
    });
    prettyPrint({ created, matchFilter })
    return created.toObject();
  }

  async getTasks(): Promise<Task[]> {
    const tasks = await this.dbModels.task.find();
    return tasks.map(t => t.toObject());
  }

  async getTask(
    taskName: string,
  ): Promise<Task | undefined> {
    const task = await this.dbModels.task.findOne({ taskName });
    if (!task) return;

    return task.toObject();
  }

  async advanceCursor(taskName: string): Promise<Task | undefined> {
    const task = await this.dbModels.task.findOne({ taskName });
    if (!task) {
      return;
    }
    const o = task.toObject();
    this.log.debug(`advancing task ${o.collectionName}.${o.cursorField}: ${o.cursorValue}`)
    const { match, cursorField, cursorValue, collectionName } = task;
    const q: PipelineStage.Match = {
      $match: {}
    }
    q.$match[cursorField] = { $gt: cursorValue };

    const getNextQ = _.merge({}, match, q);
    const query: any = getNextQ.$match;
    prettyPrint({ task, query });
    delete query['_id'];
    prettyPrint({ query });
    const nextItem = await this.conn().collection(collectionName).findOne(query);
    prettyPrint({ nextItem });
    if (!nextItem) {
      return;
    }
    task.cursorValue = nextItem[task.cursorField];
    await task.save();
    return task.toObject();
  }
}
