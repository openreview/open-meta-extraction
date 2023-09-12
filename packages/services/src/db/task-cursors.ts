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
import { FilterQuery, Model } from 'mongoose';
import { MongoDB, mongooseExecScopeWithDeps } from './mongodb';


import {
  composeScopes,
  getServiceLogger,
  prettyFormat,
  withScopedExec,
} from '@watr/commonlib';

import {
  DBModels,
  Task
} from './schemas';
import { TaskDocument } from './query-api';

export type TaskCursorNeeds = {
  mongoDB: MongoDB;
}
type DefineTaskArgs<M> = {
  taskName: string,
  model: Model<M>,
  cursorField: string,
  matchLastQ?: FilterQuery<any>,
  matchNextQ?: FilterQuery<any>
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
    matchLastQ,
    matchNextQ
  }: DefineTaskArgs<M>): Promise<Task> {
    const collectionName = model.collection.name;
    const matchLast = matchLastQ ? matchLastQ : _.set({}, [cursorField], -1 );
    const matchNext = matchNextQ ? matchNextQ : _.set({}, [cursorField], { $exists: true });

    const created = await this.dbModels.task.create({
      taskName,
      collectionName,
      matchLast,
      matchNext,
      cursorField,
      cursorValue: -1,
      runStatus: 'uninitialized'
    });

    return created.toObject();
  }

  async deleteTask(taskName: string) {
    const toDelete = await this.dbModels.task.findOne({ taskName });
    if (!toDelete) {
      this.log.warn(`Trying to delete non-existent task ${taskName}`);
      return;
    }
    await toDelete.deleteOne();
  }

  async findTask(taskName: string,): Promise<TaskDocument | undefined> {
    const task = await this.dbModels.task.findOne({ taskName });
    if (!task) return;

    return task;
  }

  async getTasks(): Promise<Task[]> {
    const tasks = await this.dbModels.task.find();
    return tasks.map(t => t.toObject());
  }

  async getTask(
    taskName: string,
  ): Promise<Task | undefined> {
    const task = await this.findTask(taskName);
    if (!task) return;

    return task.toObject();
  }

  #collectionToModelDict(): Record<string, Model<any>> {
    const models = this.conn().models;
    const dict: Record<string, Model<any>> = _.fromPairs(
      _.map(_.toPairs(models), ([, m]) => {
        return [m.collection.name, m];
      })
    );
    return dict;
  }

  #getModelForCollection<T>(collectionName: string): Model<T> {
    const dict = this.#collectionToModelDict();
    const model = dict[collectionName]
    if (!model) {
      throw new Error(`advanceCursor(): no collection named ${collectionName} found; `);
    }
    return model;
  }

  async #maybeInitTask(task: TaskDocument): Promise<TaskDocument> {
    if (task.runStatus !== 'uninitialized') {
      return task;
    }
    task.runStatus = 'running';

    const model = this.#getModelForCollection<object>(task.collectionName);
    const getFirstQ = _.merge({}, task.matchLast);
    const query: any = getFirstQ;
    // first item actually represents the last processed item, so it won't be reprocessed
    const firstItem = await model.findOne(query, null, { strictQuery: 'throw' });
    if (!firstItem) {
      this.log.debug(`Initializing task ${task.taskName}: no initial item found`)
      return task.save();
    }
    const fi = prettyFormat({ firstItem })
    this.log.debug(`Initializing first Item = ${fi}`)

    const cursorValue = firstItem.get(task.cursorField);
    task.cursorValue = cursorValue;
    return task.save();
  }

  async advanceCursor(taskName: string): Promise<Task | undefined> {
    const maybeTask = await this.findTask(taskName);
    if (!maybeTask) {
      throw new Error(`advanceCursor(): no task named ${taskName} found`);
    }
    const task = await this.#maybeInitTask(maybeTask);

    const dbModel = this.#getModelForCollection<Task>(task.collectionName);


    let getNextQuery: FilterQuery<any> = {
      $and: [
        task.matchNext,
        _.set({}, [task.cursorField, '$gt'], task.cursorValue),
      ]
    };

    this.log.debug(`advanceCursor(${task.taskName}): db.${task.collectionName}.${task.cursorField} = ${task.cursorValue}`)

    const nextItem = await dbModel.findOne(getNextQuery, null, { strictQuery: 'throw' });

    if (!nextItem) {
      return;
    }

    const nextCursorValue = nextItem.get(task.cursorField);
    if (nextCursorValue === undefined) {
      const fmt = prettyFormat(nextItem)
      throw new Error(`advanceCursor(): field ${task.cursorField} not in item ${fmt}; `);
    }

    task.cursorValue = nextCursorValue;
    await task.save();
    return task.toObject();
  }
}
