import _ from 'lodash';
import { asyncMapSeries, setLogEnvLevel } from '@watr/commonlib';
import { MongoDB, mongoConfig } from '~/db/mongodb';
import { TaskCursors, taskCursorExecScopeWithDeps } from './task-cursors';
import { initMyColl } from '~/db/mock-data';

describe('Task Cursors', () => {

  setLogEnvLevel('warn');

  const taskCursorScope = () => {
    const scopes = taskCursorExecScopeWithDeps();
    return scopes(mongoConfig())
  }

  const mkTaskName = (i: number) => `my-task/${i}`;

  async function initColl(mongoDB: MongoDB, initialRecordCount: number = 10) {
    const myColl = await initMyColl(mongoDB)
    const records = _.map(_.range(initialRecordCount), (i) => ({ number: i, isValid: i % 2 === 0 }))
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
      const matchNextQ = { number: { $mod: [2, 0] } };
      const matchLastQ = { number: -1 };
      await taskCursors.defineTask({
        taskName: task1,
        model: myColl,
        cursorField: 'number',
        matchLastQ,
        matchNextQ
      });

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
      const matchNextQ = { number: { $mod: [2, 0] } };
      const matchLastQ = { number: { $mod: [2, 0] } };
      await taskCursors.defineTask({
        taskName: task1,
        model: myColl,
        cursorField: 'number',
        matchLastQ,
        matchNextQ
      });


      const advance = () => taskCursors.advanceCursor('non-existant-task');
      expect(advance).rejects.toThrow(Error);

      // invalid field
      await taskCursors.defineTask({
        taskName: task2,
        model: myColl,
        cursorField: 'bad_field',
        matchLastQ,
        matchNextQ
      });
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
      const matchLastQ = { number: -1 };
      const matchNext1 = { number: { $mod: [2, 0] } };
      const matchNext2 = { number: { $mod: [3, 0] } };
      const matchNext3 = undefined;

      await taskCursors.defineTask({ taskName: task1, model: myColl, cursorField: 'number', matchLastQ, matchNextQ: matchNext1 });
      await taskCursors.defineTask({ taskName: task2, model: myColl, cursorField: 'number', matchLastQ, matchNextQ: matchNext2 });
      await taskCursors.defineTask({ taskName: task3, model: myColl, cursorField: 'number', matchLastQ, matchNextQ: matchNext3 });

      const cursorValues1 = await advanceCursor(taskCursors, task1, 3);
      const cursorValues2 = await advanceCursor(taskCursors, task2, 3);
      const cursorValues3 = await advanceCursor(taskCursors, task3, 3);

      expect(cursorValues1).toMatchObject([0, 2, 4])
      expect(cursorValues2).toMatchObject([0, 3, 6])
      expect(cursorValues3).toMatchObject([0, 1, 2])
    }
  });

  it('should initialize task starting points with query', async () => {
    const taskName = mkTaskName(1);
    for await (const { mongoDB, taskCursors } of taskCursorScope()) {
      const model = await initColl(mongoDB, 10);

      for (const n of _.range(10)) {
        const matchLastQ = { number: n - 1 };
        const matchNextQ = undefined;
        await taskCursors.defineTask({
          taskName,
          model,
          cursorField: 'number',
          matchLastQ,
          matchNextQ
        });

        const cursorValues = await advanceCursor(taskCursors, taskName, 10);
        const numNegOnes = cursorValues.filter(v => v === -1).length;
        expect(numNegOnes).toEqual(n)
        await taskCursors.deleteTask(taskName);

      }
    }
  });

});
