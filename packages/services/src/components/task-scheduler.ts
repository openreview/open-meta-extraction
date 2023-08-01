import _ from 'lodash';
import { Logger } from 'winston';
import { delay, getServiceLogger, putStrLn } from '@watr/commonlib';
import { NoteStatus, UrlStatus } from '~/db/schemas';
import { CursorRole, MongoQueries } from '~/db/query-api';
import differenceInMilliseconds from 'date-fns/differenceInMilliseconds';
import { WithMongoGenArgs } from '~/db/mongodb';
import { WithShadowDB, withShadowDB } from './shadow-db';

async function createTaskScheduler(
  mdb?: MongoQueries
): Promise<TaskScheduler> {
  const s = new TaskScheduler(mdb);
  await s.connect();
  return s;
}

export type WithTaskScheduler = WithShadowDB & {
  taskScheduler: TaskScheduler;
};

export async function* withTaskScheduler(args: WithMongoGenArgs): AsyncGenerator<WithTaskScheduler, void, any> {
  for await (const { mongoose, mdb, shadowDB } of withShadowDB(args)) {
    const taskScheduler = await createTaskScheduler(mdb);
    yield { mongoose, mdb, shadowDB, taskScheduler };
  }
}

export class TaskScheduler {
  log: Logger;
  mdb: MongoQueries;

  constructor(mdb?: MongoQueries) {
    this.log = getServiceLogger('TaskScheduler');
    this.mdb = mdb || new MongoQueries();
  }

  async connect() {
    await this.mdb.connect();
  }

  async close() {
    await this.mdb.close();
  }

  async* genUrlStream(): AsyncGenerator<UrlStatus, void, void> {
    let done = false
    while (!done) {
      this.log.info(`Iterating new URLs`)
      for await (const url of this.newUrlGenerator()) {
        this.log.debug(`Scheduling new URL ${url.noteId}`);
        yield url;
      }
      let counter = 0;
      let bailEarly = false;
      this.log.info(`Iterating old URLs`);
      for await (const url of this.oldUrlGenerator()) {
        // only process 100 old urls before trying new urls again
        counter++;
        if (counter > 100) {
          bailEarly = true;
          break;
        }
        yield url;
      }
      done = !bailEarly;
    }
  }
  async* genUrlStreamRateLimited(maxRateMs: number): AsyncGenerator<UrlStatus, void, void> {
    let startTime = new Date();
    for await (const url of this.genUrlStream()) {
      yield url;
      const currTime = new Date();
      const elapsedMs = differenceInMilliseconds(currTime, startTime);
      const waitTime = maxRateMs - elapsedMs;
      if (waitTime > 0) {
        this.log.info(`Delaying ${waitTime / 1000} seconds...`);
        await delay(waitTime);
      }
    }
  }

  async* urlStatusGenerator(role: CursorRole): AsyncGenerator<UrlStatus, string, void> {
    let current = await this.mdb.getCursor(role);

    while (current) {
      const urlStatus = await this.mdb.findUrlStatusById(current.noteId);
      if (!urlStatus) {
        return 'error:inconsistent-state';
      }
      try {
        // Advance cursor before yielding
        current = await this.mdb.advanceCursor(current._id);
        //
        yield urlStatus;
      }
      catch (error) {
        this.log.error(`Error: ${error}`);
        return 'error:exception';
      }

    }
    return 'done';
  }

  oldUrlGenerator(): AsyncGenerator<UrlStatus, string, void> {
    return this.urlStatusGenerator('extract-fields/all');
  }
  newUrlGenerator(): AsyncGenerator<UrlStatus, string, void> {
    return this.urlStatusGenerator('extract-fields/newest');
  }

  async createUrlCursor(role: CursorRole) {
    const existing = await this.mdb.getCursor(role);
    if (existing) {
      this.log.info(`Cursor ${role} already exists. Delete first to run create.`)
      return;
    }

    let startingNote: NoteStatus | undefined;

    switch (role) {
      case 'extract-fields/all':
        startingNote = await this.mdb.getNextNoteWithValidURL(0);
        break;

      case 'extract-fields/newest':
        const lastSuccess = await this.mdb.getLastNoteWithSuccessfulExtractionV2();
        if (!lastSuccess) {
          return;
        }
        startingNote = await this.mdb.getNextNoteWithValidURL(lastSuccess.number)
        break;
    }

    if (!startingNote) {
      this.log.info(`Cursor ${role} not created: No notes found in db`);
      return;
    }
    this.log.info(`Creating cursor ${role} for note ${startingNote.id}/#${startingNote.number}`);
    await this.mdb.createCursor(role, startingNote.id);
    this.log.info('Done');
  }

  async deleteUrlCursor(role: CursorRole) {
    this.log.info(`Deleting Cursor ${role}`);
    const didDelete = await this.mdb.deleteCursor(role);
    const msg = didDelete ? 'deleted' : 'not deleted';
    this.log.info(`  Cursor was ${msg}`);
  }
}
