import _ from 'lodash';
import { asyncMapSeries, composeScopes, setLogEnvLevel } from '@watr/commonlib';
import { MongoDB, mongoConfig, mongooseExecScopeWithDeps } from '~/db/mongodb';
import { TaskCursors, taskCursorExecScope, taskCursorExecScopeWithDeps } from './task-cursors';
import { initMyColl } from './mongo-helpers';

describe('Task Cursors', () => {

  setLogEnvLevel('debug');

  const taskCursorScope = () => {
    const scopes = taskCursorExecScopeWithDeps();
    return scopes(mongoConfig())
  }

  const mkTaskName = (i: number) => `my-task/${i}`;

  async function initColl(mongoDB: MongoDB) {
    const myColl = await initMyColl(mongoDB)
    const records = _.map(_.range(10), (i) => ({ number: i, isValid: i % 2 === 0 }))
    await myColl.insertMany(records);
    return myColl;
  }

  async function advanceCursor(taskCursors: TaskCursors, taskname: string, count: number) {
    return await asyncMapSeries(_.range(count), async () => {
      const t = await taskCursors.advanceCursor(taskname)
      const i = t ? t.cursorValue : -1;
      return i;
    });
  }

  it('should define/initialize tasks', async () => {
    const task1 = mkTaskName(1);

    for await (const { mongoDB, taskCursors } of taskCursorScope()) {

      const myColl = await initColl(mongoDB);
      const matchFilter = { $match: { number: { $mod: [2, 0] } } };
      await taskCursors.defineTask(task1, myColl, 'number', -1, matchFilter);

      const cursorValues = await advanceCursor(taskCursors, task1, 3);
      expect(cursorValues).toMatchObject([0, 2, 4])

      const cursorValues2 = await advanceCursor(taskCursors, task1, 3);
      expect(cursorValues2).toMatchObject([6, 8, -1])
    }
  });

  it('should throw error if name of task/collection/cursorField is invalid', async () => {
    const task1 = mkTaskName(1);
    const task2 = mkTaskName(2);
    for await (const { mongoDB, taskCursors } of taskCursorScope()) {
      const myColl = await initColl(mongoDB);
      const matchFilter = { $match: { number: { $mod: [2, 0] } } };
      await taskCursors.defineTask(task1, myColl, 'number', -1, matchFilter);

      const advance = () => taskCursors.advanceCursor('non-existant-task');
      expect(advance).rejects.toThrow(Error);

      // invalid field
      await taskCursors.defineTask(task2, myColl, 'bad_field', -1, matchFilter);
      expect(
        async () => taskCursors.advanceCursor(task2)
      ).rejects.toThrow();

    }
  });

  it('should allow multiple active tasks', async () => {
    const task1 = mkTaskName(1);
    const task2 = mkTaskName(2);
    const task3 = mkTaskName(3);
    for await (const { mongoDB, taskCursors } of taskCursorScope()) {
      const myColl = await initColl(mongoDB);
      const matchFilter1 = { $match: { number: { $mod: [2, 0] } } };
      const matchFilter2 = { $match: { number: { $mod: [3, 0] } } };
      const matchFilter3 = undefined;

      await taskCursors.defineTask(task1, myColl, 'number', -1, matchFilter1);
      await taskCursors.defineTask(task2, myColl, 'number', -1, matchFilter2);
      await taskCursors.defineTask(task3, myColl, 'number', -1, matchFilter3);

      const cursorValues1 = await advanceCursor(taskCursors, task1, 3);
      const cursorValues2 = await advanceCursor(taskCursors, task2, 3);
      const cursorValues3 = await advanceCursor(taskCursors, task3, 3);

      expect(cursorValues1).toMatchObject([0, 2, 4])
      expect(cursorValues2).toMatchObject([0, 3, 6])
      expect(cursorValues3).toMatchObject([0, 1, 2])
    }
  });

});
