import _ from 'lodash';
import { asyncEachOfSeries, setLogEnvLevel } from '@watr/commonlib';
import { useMonitorService } from './monitor-service';
import { createFakeNoteList } from '~/db/mock-data';
import { useShadowDB } from './shadow-db';
import { Note } from './openreview-gateway';


describe('Monitor Service', () => {

  setLogEnvLevel('info');

  it('should gather and format extraction summary', async () => {
    for await (const { shadowDB, mongoose } of useShadowDB({ uniqDB: true })) {
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

      for await (const { monitorService } of useMonitorService({
        mongoose,
        sendNotifications,
        monitorNotificationInterval,
        monitorUpdateInterval
      })) {
        await monitorService.notify();
      }
    }
  });
});
