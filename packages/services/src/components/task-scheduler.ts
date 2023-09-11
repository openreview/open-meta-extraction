import _ from 'lodash';
import { Logger } from 'winston';
import { composeScopes, delay, getServiceLogger, prettyPrint, putStrLn, withScopedExec } from '@watr/commonlib';
import differenceInMilliseconds from 'date-fns/differenceInMilliseconds';
import { TaskCursors, taskCursorExecScope } from '~/db/task-cursors';
import { Model, PipelineStage } from 'mongoose';
import { MongoDB, mongooseExecScopeWithDeps } from '~/db/mongodb';


// TODO move or use ts-toolbelt
export type Class<T extends object = {}, Arguments extends unknown[] = any[]> = {
  prototype: T;
  new(...arguments_: Arguments): T;
};

export type Instance<C extends Class> =
  C extends Class<infer T, any[]>
  ? T : any;

type ClassMethod<
  T extends object
> = {
  [K in keyof T]: T[K] extends Function ? T[K] : never;
}[keyof T];


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
  >(
    executor: I,
    method: M,
    model: Model<Coll>,
    cursorField: string,
    initCursorValue: number,
    matchFilter?: PipelineStage.Match
  ) {
    const name = executor.constructor.name;
    const taskName = `${name}#${method.name}`;
    this.log.info(`Registering task ${taskName}`);
    const existing = await this.taskCursors.getTask(taskName);
    if (existing) {
      this.log.info(`Task ${taskName} exists`);
      prettyPrint({ existing });
      return;
    }
    const task = await this.taskCursors.defineTask(
      taskName,
      model,
      cursorField,
      initCursorValue,
      matchFilter
    );
    return task;
  }

  async initTask<M>(
    taskName: string,
    model: Model<M>,
    cursorField: string,
    initCursorValue: number,
    matchFilter?: PipelineStage.Match
  ) {
    const task = await this.taskCursors.defineTask(
      taskName,
      model,
      cursorField,
      initCursorValue,
      matchFilter
    );
    return task;

  }

  async* taskStream(taskName: string): AsyncGenerator<number, void, void> {
    putStrLn('Advancing cursor')
    // TODO Acquire lock on Task record
    let nextTask = await this.taskCursors.advanceCursor(taskName);
    while (nextTask) {
      // TODO unlock task
      yield nextTask.cursorValue;
      nextTask = await this.taskCursors.advanceCursor(taskName);
    }
  }
  async* taskStreamRateLimited(taskName: string, maxRateMs: number): AsyncGenerator<number, void, void> {
    for await (const url of this.taskStream(taskName)) {
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

  // async* genUrlStream(): AsyncGenerator<UrlStatus, void, void> {
  //   let done = false
  //   while (!done) {
  //     this.log.info(`Iterating new URLs`)
  //     for await (const url of this.newUrlGenerator()) {
  //       this.log.debug(`Scheduling new URL ${url.noteId}`);
  //       yield url;
  //     }
  //     let counter = 0;
  //     let bailEarly = false;
  //     this.log.info(`Iterating old URLs`);
  //     for await (const url of this.oldUrlGenerator()) {
  //       // only process 100 old urls before trying new urls again
  //       counter++;
  //       if (counter > 100) {
  //         bailEarly = true;
  //         break;
  //       }
  //       yield url;
  //     }
  //     done = !bailEarly;
  //   }
  // }
  // async* genUrlStreamRateLimited(maxRateMs: number): AsyncGenerator<UrlStatus, void, void> {
  //   for await (const url of this.genUrlStream()) {
  //     const startTime = new Date();

  //     // Yield
  //     yield url;

  //     const endTime = new Date();
  //     const elapsedMs = differenceInMilliseconds(endTime, startTime);
  //     this.log.debug(`RateLimiter: ${elapsedMs}ms processing time`);
  //     const waitTime = maxRateMs - elapsedMs;
  //     if (waitTime > 0) {
  //       this.log.info(`RateLimiter: delaying ${waitTime / 1000} seconds...`);
  //       await delay(waitTime);
  //     }
  //   }
  // }

  // async* urlStatusGenerator(role: CursorRole): AsyncGenerator<UrlStatus, string, void> {
  //   let current = await this.mongoQueries.getCursor(role);

  //   while (current) {
  //     const urlStatus = await this.mongoQueries.findUrlStatusById(current.noteId);
  //     if (!urlStatus) {
  //       return 'error:inconsistent-state';
  //     }
  //     try {
  //       // Advance cursor before yielding
  //       current = await this.mongoQueries.advanceCursor(current._id);
  //       //
  //       yield urlStatus;
  //     }
  //     catch (error) {
  //       this.log.error(`Error: ${error}`);
  //       return 'error:exception';
  //     }

  //   }
  //   return 'done';
  // }

  // oldUrlGenerator(): AsyncGenerator<UrlStatus, string, void> {
  //   return this.urlStatusGenerator('extract-fields/all');
  // }

  // newUrlGenerator(): AsyncGenerator<UrlStatus, string, void> {
  //   return this.urlStatusGenerator('extract-fields/newest');
  // }

  // async createUrlCursor(role: CursorRole) {
  //   const existing = await this.mongoQueries.getCursor(role);
  //   if (existing) {
  //     this.log.info(`Cursor ${role} already exists. Delete first to run create.`)
  //     return;
  //   }

  //   let startingNote: NoteStatus | undefined;

  //   switch (role) {
  //     case 'extract-fields/all':
  //       startingNote = await this.mongoQueries.getNextNoteWithValidURL(0);
  //       break;

  //     case 'extract-fields/newest':
  //       const lastSuccess = await this.mongoQueries.getLastNoteWithSuccessfulExtractionV2();
  //       if (!lastSuccess) {
  //         return;
  //       }
  //       startingNote = await this.mongoQueries.getNextNoteWithValidURL(lastSuccess.number)
  //       break;
  //   }

  //   if (!startingNote) {
  //     this.log.info(`Cursor ${role} not created: No notes found in db`);
  //     return;
  //   }
  //   this.log.info(`Creating cursor ${role} for note ${startingNote.id}/#${startingNote.number}`);
  //   await this.mongoQueries.createCursor(role, startingNote.id);
  //   this.log.info('Done');
  // }

  // async deleteUrlCursor(role: CursorRole) {
  //   this.log.info(`Deleting Cursor ${role}`);
  //   const didDelete = await this.mongoQueries.deleteCursor(role);
  //   const msg = didDelete ? 'deleted' : 'not deleted';
  //   this.log.info(`  Cursor was ${msg}`);
  // }
}
