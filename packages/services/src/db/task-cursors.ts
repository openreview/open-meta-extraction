/**
 * Keep track of the  progress of tasks operating on a  sequence of items stored
 * in a mongodb collection
 *
 * The Task definition consists of
 * - The name of the collection holding the items to be processed
 * - The field name in the collection used to identify the task
 * - A Match expression that will be used to filter the collection
 *
 */

import _ from 'lodash';
import { Logger } from 'winston';
import { Model } from 'mongoose';
import { MongoDB, mongooseExecScopeWithDeps } from './mongodb';


import {
  composeScopes,
  getServiceLogger, prettyFormat, withScopedExec,
} from '@watr/commonlib';

import { PipelineStage } from 'mongoose';

import {
  DBModels,
  Task
} from './schemas';

export type TaskCursorNeeds = {
  mongoDB: MongoDB;
}
type DefineTaskArgs<M> = {
    taskName: string,
    model: Model<M>,
    cursorField: string,
    initCursorValue: number,
    matchFirstQ?: PipelineStage.Match,
    matchNextQ?: PipelineStage.Match
};

export const taskCursorExecScope = () => withScopedExec<TaskCursors, 'taskCursors', TaskCursorNeeds>(
  function init({ mongoDB }) {
    const taskCursors = new TaskCursors(mongoDB);
    return { taskCursors };
  }
);

export const taskCursorExecScopeWithDeps = () => composeScopes(
  mongooseExecScopeWithDeps(),
  taskCursorExecScope()
);

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

  async defineTask<M>({
    taskName,
    model,
    cursorField,
    initCursorValue,
    matchFirstQ,
    matchNextQ
  }: DefineTaskArgs<M>): Promise<Task> {
    const collectionName = model.collection.name;
    const matchFirst = matchFirstQ ? matchFirstQ : { $match: { _id: true } };
    const matchNext = matchNextQ ? matchNextQ : { $match: { _id: true } };

    const created = await this.dbModels.task.create({
      taskName,
      collectionName,
      matchFirst,
      matchNext,
      cursorField,
      cursorValue: initCursorValue
    });
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
    const task = await this.dbModels.task.findOne({ taskName }, {}, { strictQuery: true });
    if (!task) {
      throw new Error(`advanceCursor(): no task named ${taskName} found`);
    }
    const { matchFirst, matchNext, cursorField, cursorValue } = task;
    const isInitialized = cursorValue > -1;

    const q: PipelineStage.Match = {
      $match: {}
    }
    q.$match[cursorField] = { $gt: cursorValue };

    const models = this.conn().models;
    const collectionNameToModelMap = _.fromPairs(
      _.map(_.toPairs(models), ([, m]) => {
        return [m.collection.name, m];
      })
    );
    const modelForCollection = collectionNameToModelMap[task.collectionName]
    if (!modelForCollection) {
      throw new Error(`advanceCursor(): no collection named ${task.collectionName} found; `);
    }
    this.log.debug(`advancing task '${task.taskName}': db.${task.collectionName}.${task.cursorField} = ${task.cursorValue}`)

    if (!isInitialized) {
      const getFirstQ = _.merge({}, matchFirst, q);
      const query: any = getFirstQ.$match;
      delete query['_id']; // TODO fix this kludge
      // first item actually represents the last processed item, so it won't be reprocessed
      const firstItem = await modelForCollection.findOne(query, null, { strictQuery: 'throw' });
      task.cursorValue = firstItem[task.cursorField];
      await task.save();

    }

    const getNextQ = _.merge({}, matchNext, q);
    const query: any = getNextQ.$match;
    delete query['_id']; // TODO fix this kludge
    const nextItem = await modelForCollection.findOne(query, null, { strictQuery: 'throw' });

    if (!nextItem) {
      return;
    }

    if (nextItem[task.cursorField] === undefined) {
      const fmt = prettyFormat(nextItem)
      throw new Error(`advanceCursor(): field ${task.cursorField} not in item ${fmt}; `);
    }

    task.cursorValue = nextItem[task.cursorField];
    await task.save();
    return task.toObject();
  }
}
