import _ from 'lodash';
import { asyncEachOfSeries, setLogEnvLevel } from '@watr/commonlib';
import { scopedMonitorService } from './monitor-service';
import { createFakeNoteList } from '~/db/mock-data';
import { scopedShadowDB } from './shadow-db';
import { Note } from './openreview-gateway';
import { scopedMongoose } from '~/db/mongodb';
import { scopedMongoQueries } from '~/db/query-api';

describe('Monitor Service', () => {

  setLogEnvLevel('info');

  it('should gather and format extraction summary', async () => {

    for await (const { mongoose } of scopedMongoose()({ useUniqTestDB: true })) {
      for await (const { mongoQueries } of scopedMongoQueries()({ mongoose })) {
        for await (const { shadowDB } of scopedShadowDB()({ mongoQueries })) {

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

          for await (const { monitorService } of scopedMonitorService()({
            mongoose,
            sendNotifications,
            monitorNotificationInterval,
            monitorUpdateInterval
          })) {
            await monitorService.notify();
          }
        }
      }
    }
  });
});
