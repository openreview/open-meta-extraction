import _ from 'lodash';
import { prettyPrint, setLogEnvLevel } from '@watr/commonlib';
import { mongoQueriesExecScopeWithDeps } from '~/db/query-api';
import { MongoDB, mongoConfig } from '~/db/mongodb';
import { TaskCursors, taskCursorExecScope } from './task-cursors';

import { Schema, Types, Model } from 'mongoose';
import { initMyColl } from './mongo-helpers';

describe('Task Cursors', () => {

  setLogEnvLevel('debug');



  it('should define tasks', async () => {
    const taskName = 'extract-fields/grobid';
    for await (const { mongoDB } of mongoQueriesExecScopeWithDeps()(mongoConfig())) {
      for await (const { taskCursors } of taskCursorExecScope()({ mongoDB })) {
        const myColl = initMyColl(mongoDB)
        const records = _.map(_.range(10), (i) => ({ number: i, isValid: i % 2 === 0 }))
        await myColl.insertMany(records);
        await taskCursors.defineTask(
          taskName,
          myColl,
          'number',
          -1,
          { $match: { number: { $mod: [2, 0] } } },
        );
        const tasks = await taskCursors.getTasks()
        prettyPrint({ tasks })
        const advanced0 = await taskCursors.advanceCursor(taskName);
        const advanced1 = await taskCursors.advanceCursor(taskName);
        const advanced2 = await taskCursors.advanceCursor(taskName);
        prettyPrint({ advanced0, advanced1, advanced2 })

      }
    }

  });
  it.only('should allow empty match in task', async () => {
    const taskName = 'extract-fields/grobid';
    for await (const { mongoDB } of mongoQueriesExecScopeWithDeps()(mongoConfig())) {
      for await (const { taskCursors } of taskCursorExecScope()({ mongoDB })) {
        const myColl = initMyColl(mongoDB)
        const newTask = await taskCursors.defineTask(
          taskName,
          myColl,
          'number',
          -1
        );
        prettyPrint({ newTask })
      }
    }
  });
  // it('should create a task/cursor that indicates `wait for more items to process`', async () => {});
  // it('should create a task/cursor for respidering/all/some/missing', async () => {});


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
