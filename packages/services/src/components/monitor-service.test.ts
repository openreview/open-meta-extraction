import _ from 'lodash';
import { asyncEachOfSeries, loadConfig, setLogEnvLevel } from '@watr/commonlib';
import { monitorServiceExecScope } from './monitor-service';
import { createFakeNoteList } from '~/db/mock-data';
import { Note } from './openreview-gateway';
import { shadowDBExecScopeWithDeps } from './shadow-db';

describe('Monitor Service', () => {

  setLogEnvLevel('info');

  it('should gather and format extraction summary', async () => {
    const config = loadConfig();

    for await (const { shadowDB, mongoose } of shadowDBExecScopeWithDeps()({ useUniqTestDB: true, config })) {

      const noteCount = 50;
      const notes = createFakeNoteList(noteCount, 1);
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
        mongoose,
        sendNotifications,
        monitorNotificationInterval,
        monitorUpdateInterval,
        config
      })) {
        await monitorService.notify();
      }
    }
  });
});
