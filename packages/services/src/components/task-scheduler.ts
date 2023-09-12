import _ from 'lodash';
import { Logger } from 'winston';
import { composeScopes, delay, getServiceLogger, putStrLn, withScopedExec } from '@watr/commonlib';
import differenceInMilliseconds from 'date-fns/differenceInMilliseconds';
import { TaskCursors, taskCursorExecScope } from '~/db/task-cursors';
import { FilterQuery, Model } from 'mongoose';
import { MongoDB, mongooseExecScopeWithDeps } from '~/db/mongodb';
import { Task } from '~/db/schemas';


// TODO move or use ts-toolbelt
export type Class<T extends object = {}, Arguments extends unknown[] = any[]> = {
  prototype: T;
  new(...arguments_: Arguments): T;
};

export type Instance<C extends Class> =
  C extends Class<infer T, any[]>
  ? T : any;

type Method<
  T extends object,
  C extends Class<T>,
  I extends Instance<C>
> = {
  [K in keyof I]: I[K] extends Function ? I[K] : never;
}[keyof I];

type TaskSchedulerNeeds = {
  mongoDB: MongoDB;
  taskCursors: TaskCursors
}

const taskSchedulerScope = () => withScopedExec<
  TaskScheduler,
  'taskScheduler',
  TaskSchedulerNeeds
>(
  async function init({ mongoDB, taskCursors }) {
    const taskScheduler = new TaskScheduler({ mongoDB, taskCursors });
    return { taskScheduler };
  },
);

export const taskSchedulerExecScope = () => composeScopes(
  taskCursorExecScope(),
  taskSchedulerScope()
);

export const taskSchedulerScopeWithDeps = () => composeScopes(
  mongooseExecScopeWithDeps(),
  taskSchedulerExecScope(),
);

type RegisterTaskArgs<
  T extends object,
  C extends Class<T>,
  I extends Instance<C>,
  M extends Method<T, C, I>,
  Coll
> = {
  executor: I,
  method: M,
  model: Model<Coll>,
  cursorField: string,
  matchLastQ?: FilterQuery<any>,
  matchNextQ?: FilterQuery<any>,
};

type GetTaskArgs<
  T extends object,
  C extends Class<T>,
  I extends Instance<C>,
  M extends Method<T, C, I>,
> = {
  executor: I;
  method: M;
};

export class TaskScheduler {
  log: Logger;
  mongoDB: MongoDB;
  taskCursors: TaskCursors;

  constructor({ mongoDB, taskCursors }: TaskSchedulerNeeds) {
    this.log = getServiceLogger('TaskScheduler');
    this.mongoDB = mongoDB;
    this.taskCursors = taskCursors;
  }

  async registerTask<
    T extends object,
    C extends Class<T>,
    I extends Instance<C>,
    M extends Method<T, C, I>,
    Coll
  >({
    executor,
    method,
    model,
    cursorField,
    matchLastQ,
    matchNextQ,
  }: RegisterTaskArgs<T, C, I, M, Coll>): Promise<Task> {
    const name = executor.constructor.name;
    const taskName = `${name}#${method.name}`;
    this.log.info(`Registering task ${taskName}`);
    const existing = await this.taskCursors.getTask(taskName);
    if (existing) {
      this.log.info(`registerTask: ${taskName} already exists`);
      return existing;
    }
    const task = await this.taskCursors.defineTask({
      taskName,
      model,
      cursorField,
      matchLastQ,
      matchNextQ,
    });
    return task;
  }

  getTaskStream(task: Task, rateLimitMinMS?: number): AsyncGenerator<number, void, void> {
    const taskName = task.taskName;
    this.log.debug(`getTaskStream(${taskName})`);
    if (rateLimitMinMS) {
      return this.#taskStreamRateLimited(taskName, rateLimitMinMS);
    }
    return this.#taskStream(taskName);
  }

  getTask<
    T extends object,
    C extends Class<T>,
    I extends Instance<C>,
    M extends Method<T, C, I>,
  >({
    executor,
    method
  }: GetTaskArgs<T, C, I, M>): Promise<Task | undefined> {
    const name = executor.constructor.name;
    const taskName = `${name}#${method.name}`;
    this.log.debug(`getTask(${taskName})`);
    return this.taskCursors.getTask(taskName);
  }

  async* #taskStream(taskName: string): AsyncGenerator<number, void, void> {
    putStrLn('Advancing cursor')
    let nextTask = await this.taskCursors.advanceCursor(taskName);
    while (nextTask) {
      yield nextTask.cursorValue;
      nextTask = await this.taskCursors.advanceCursor(taskName);
    }
  }
  async* #taskStreamRateLimited(taskName: string, maxRateMs: number): AsyncGenerator<number, void, void> {
    for await (const url of this.#taskStream(taskName)) {
      const startTime = new Date();

      yield url;

      const endTime = new Date();
      const elapsedMs = differenceInMilliseconds(endTime, startTime);
      this.log.debug(`RateLimiter: ${elapsedMs}ms processing time`);
      const waitTime = maxRateMs - elapsedMs;
      if (waitTime > 0) {
        this.log.info(`RateLimiter: delaying ${waitTime / 1000} seconds...`);
        await delay(waitTime);
      }
    }
  }
}
