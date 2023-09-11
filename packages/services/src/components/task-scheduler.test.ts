import _ from 'lodash';
import { asyncDoUntil, prettyPrint, putStrLn, setLogEnvLevel } from '@watr/commonlib';
import { taskSchedulerScopeWithDeps } from './task-scheduler';
import { mongoConfig, } from '~/db/mongodb';
import { initMyColl } from '~/db/mock-data';
import { PipelineStage } from 'mongoose';

describe('Task Scheduling', () => {
  setLogEnvLevel('debug');

  const taskSchedulerScope = () => {
    const scope = taskSchedulerScopeWithDeps();
    return scope(mongoConfig())
  }

  const mkRecords = (start: number, count: number) =>
    _.map(_.range(start, start + count), (i) => ({ number: i, isValid: true }));

  async function toArray(asyncGen: AsyncGenerator<number, void, void>): Promise<number[]> {
    const ret: number[] = [];
    await asyncDoUntil(
      async () => {
        const n = await asyncGen.next()
        if (!n.done) ret.push(n.value)
        return !!n.done;
      },
      async (isDone) => isDone
    );
    return ret;
  }

  it('should use task cursors to control iteration', async () => {
    const taskName = 'my-task';
    for await (const { mongoDB, taskScheduler } of taskSchedulerScope()) {
      const myColl = await initMyColl(mongoDB)

      await taskScheduler.initTask(
        taskName,
        myColl,
        'number',
        -1,
      );

      // Run tasks 0-10
      await myColl.insertMany(mkRecords(0, 10));
      const taskRun1 = await toArray(taskScheduler.taskStream(taskName));
      expect(taskRun1).toMatchObject(_.range(0, 10));

      // Insert new tasks, next run should pick up from end of last run
      await myColl.insertMany(mkRecords(10, 2));
      const taskRun2 = await toArray(taskScheduler.taskStream(taskName));
      expect(taskRun2).toMatchObject(_.range(10, 12));
    }
  });

  it.only('should register/run tasks', async () => {
    class TaskRunner {
      async runMyTask(n: number) {
        putStrLn('running my task');
      }
    }
    const taskRunner = new TaskRunner();
    for await (const { mongoDB, taskScheduler } of taskSchedulerScope()) {
      const myColl = await initMyColl(mongoDB)
      const matchFilter = { $match: { number: { $mod: [2, 0] } } };

      await taskScheduler.registerTask(
        taskRunner,
        taskRunner.runMyTask,
        myColl,
        'number',
        -1,
        matchFilter
      );

      const tasks1 = await taskScheduler.taskCursors.getTasks()
      prettyPrint({ tasks1 });

      await taskScheduler.registerTask(
        taskRunner,
        taskRunner.runMyTask,
        myColl,
        'number',
        -1,
        matchFilter
      );
      const tasks2 = await taskScheduler.taskCursors.getTasks()
      prettyPrint({ tasks2 });
    }
  });
});
