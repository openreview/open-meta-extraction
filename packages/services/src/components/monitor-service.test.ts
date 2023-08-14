import _ from 'lodash';
import { asyncEachOfSeries, loadConfig, setLogEnvLevel } from '@watr/commonlib';
import { monitorServiceExecScope } from './monitor-service';
import { createFakeNoteList } from '~/db/mock-data';
import { Note } from './openreview-gateway';
import { shadowDBExecScopeWithDeps, shadowDBTestConfig } from './shadow-db';

describe('Monitor Service', () => {

  setLogEnvLevel('info');

  it('should gather and format extraction summary', async () => {
    const shadowDBConfig = shadowDBTestConfig();
    const config = shadowDBConfig.config;


    for await (const { shadowDB, mongoDB } of shadowDBExecScopeWithDeps()(shadowDBConfig)) {

      const noteCount = 50;
      const notes = createFakeNoteList(config, noteCount, 1);
      await asyncEachOfSeries(notes, async (n: Note, i: number) => {
        await shadowDB.saveNote(n, true);
        const noteId = n.id;
        const theAbstract = 'Ipsem..'
        const pdf = 'http://some/paper.pdf';
        if (i % 2 === 0) {
          await shadowDB.updateFieldStatus(noteId, 'abstract', theAbstract);
        }
        if (i % 3 === 0) {
          await shadowDB.updateFieldStatus(noteId, 'pdf', pdf);
        }
      });

      const sendNotifications = false;
      const monitorUpdateInterval = 0;
      const monitorNotificationInterval = 0;

      for await (const { monitorService } of monitorServiceExecScope()({
        ...shadowDBConfig,
        mongoDB,
        sendNotifications,
        monitorNotificationInterval,
        monitorUpdateInterval,
      })) {
        await monitorService.notify();
      }
    }
  });
});
