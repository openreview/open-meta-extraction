
import { prettyPrint, setLogEnvLevel } from '@watr/commonlib';
import { mongoQueriesExecScopeWithDeps } from '~/db/query-api';
import { DBModels } from '~/db/schemas';
import { MongoDBNeeds, mongoConfig } from '~/db/mongodb';
import { TaskCursors } from './task-cursors';

describe('Task Cursors', () => {

  setLogEnvLevel('debug');

  it.only('should define tasks', async () => {
    const taskName = 'extract-fields/grobid';
    for await (const { mongoQueries, mongoDB } of mongoQueriesExecScopeWithDeps()(mongoConfig())) {
      const taskCursors = new TaskCursors(mongoDB);
      await taskCursors.defineTask(
        taskName,
        mongoQueries.dbModels.noteStatus,
        { $match: { validUrl: true } },
      );
      const tasks = await taskCursors.getTasks(taskName)

      const cursor = await taskCursors.createCursor(taskName);
    }
    // Sample iteration loop for extraction:
    // - Acquire lock on Task record
    // - if cursor/last for task exists
    //   - if valid next item:
    //     - create cursor/processing w/uniq lock for next available item (use task.match)
    //     - move cursor/last to cursor/processing
    //     - unlock cursor/last
    //   - else no valid next:
    //     - unlock cursor/last (keep it where it is)
    //     - advance task state, e.g., running -> waiting
    // - if cursor/last for task does not exist
    //   - exit (tasks will periodically re-init and create cursor/last )
    //   - advance cursor state,e.g.,

    // Sample Task Management init:
    // - create tasks e.g., { extract-all, 'url_status' { $match: from beginning } } 'stopped'
    // - foreach task
    //   - init cursor/last to (first valid match) - 1 (can be phantom item)
    //   - set task state='waiting'
  });
  // it('should create a task/cursor that indicates `wait for more items to process`', async () => {});
  // it('should create a task/cursor for respidering/all/some/missing', async () => {});
  // it('should', async () => {});
  // it('should', async () => {});
  // it('should', async () => {});
  // it('should', async () => {});
  // it('should', async () => {});
  // it('should', async () => {});
  // it('should', async () => {});
  // it('should', async () => {});
  // it('should', async () => {});


  it('should create/update/delete fetch cursors', async () => {

    // for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()(mongoConfig())) {
    //   expect(await mongoQueries.getCursor('extract-fields/all')).toBeUndefined();
    //   expect(await mongoQueries.updateCursor('extract-fields/all', '1')).toMatchObject({ role: 'extract-fields/all', noteId: '1' });
    //   expect(await mongoQueries.updateCursor('extract-fields/newest', '2')).toMatchObject({ role: 'extract-fields/newest', noteId: '2' });
    //   expect(await mongoQueries.deleteCursor('extract-fields/all')).toBe(true);
    //   expect(await mongoQueries.deleteCursor('extract-fields/all')).toBe(false);
    //   expect(await mongoQueries.getCursor('extract-fields/all')).toBeUndefined();
  });

  it('should advance cursors', async () => {
    // for await (const { mongoQueries } of mongoQueriesExecScopeWithDeps()(mongoConfig())) {
    //   const nocursor = await mongoQueries.createCursor('extract-fields/all', 'note#1');
    //   expect(nocursor).toBeUndefined();

    //   await populateDBHostNoteStatus(mongoQueries, 20);
    //   const cursor = await mongoQueries.createCursor('extract-fields/all', 'note#1');
    //   expect(cursor).toBeDefined();
    //   if (!cursor) return;

    //   prettyPrint({ cursor });

    // }
  });

});
