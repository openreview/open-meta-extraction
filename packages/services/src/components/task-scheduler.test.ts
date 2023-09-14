import _ from 'lodash';
import { setLogEnvLevel } from '@watr/commonlib';
import { TaskScheduler, taskSchedulerScopeWithDeps, ClassXX } from './task-scheduler';
import { mongoConfig, } from '~/db/mongodb';
import { initMyColl } from '~/db/mock-data';
import { asyncGenToArray } from '~/util/generators';

describe('Task Scheduling', () => {
  setLogEnvLevel('warn');

  const taskSchedulerScope = () => {
    const scope = taskSchedulerScopeWithDeps();
    return scope(mongoConfig())
  }

  const mkRecords = (start: number, count: number) =>
    _.map(_.range(start, start + count), (i) => ({ number: i, isValid: true }));

  class TaskRunner {
    taskScheduler: TaskScheduler;
    taskLog: number[] = [];
    constructor(taskScheduler: TaskScheduler) {
      this.taskScheduler = taskScheduler;
    }
    async runMyTask() {
      const executor: TaskRunner = this;
      const task = await this.taskScheduler.getTask({ executor, method: this.runMyTask });
      if (!task) {
        return;
      }

      for await (const taskNum of this.taskScheduler.getTaskStream(task)) {
        this.taskLog.push(taskNum);
      }
    }
  }

  it('should use task cursors to control iteration', async () => {
    for await (const { mongoDB, taskScheduler } of taskSchedulerScope()) {
      const myColl = await initMyColl(mongoDB)
      const taskRunner = new TaskRunner(taskScheduler);
      const matchNextQ = { number: { $mod: [2, 0] } };
      const task = await taskScheduler.registerTask({
        executor: taskRunner,
        method: taskRunner.runMyTask,
        model: myColl,
        cursorField: 'number',
        matchNextQ
      });

      // Run tasks 0-10
      await myColl.insertMany(mkRecords(0, 10));
      const taskRun1 = await asyncGenToArray(taskScheduler.getTaskStream(task));
      expect(taskRun1).toMatchObject([0, 2, 4, 6, 8]);

      // Insert new tasks, next run should pick up from end of last run
      await myColl.insertMany(mkRecords(10, 3));
      const taskRun2 = await asyncGenToArray(taskScheduler.getTaskStream(task));
      expect(taskRun2).toMatchObject([10, 12]);
    }
  });

  it('should register/run tasks', async () => {

    for await (const { mongoDB, taskScheduler } of taskSchedulerScope()) {
      const taskRunner = new TaskRunner(taskScheduler);
      const myColl = await initMyColl(mongoDB)
      await myColl.insertMany(mkRecords(0, 4));
      const matchNextQ = { number: { $mod: [2, 0] } };

      await taskScheduler.registerTask({
        executor: taskRunner,
        method: taskRunner.runMyTask,
        model: myColl,
        cursorField: 'number',
        matchNextQ
      });

      await taskScheduler.taskCursors.getTasks();
      // prettyPrint({ tasks1 });
      await taskRunner.runMyTask();
      expect(taskRunner.taskLog).toMatchObject([0, 2])

      // No more tasks added, so this should not log more items
      await taskRunner.runMyTask();
      expect(taskRunner.taskLog).toMatchObject([0, 2])

      await myColl.insertMany(mkRecords(4, 4));
      await taskRunner.runMyTask();
      expect(taskRunner.taskLog).toMatchObject([0, 2, 4, 6])
    }
  });

});
