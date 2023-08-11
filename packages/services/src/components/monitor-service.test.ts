import _ from 'lodash';
import { asyncEachOfSeries, loadConfig, setLogEnvLevel } from '@watr/commonlib';
import { scopedMonitorService } from './monitor-service';
import { createFakeNoteList } from '~/db/mock-data';
import { scopedShadowDBWithDeps } from './shadow-db';
import { Note } from './openreview-gateway';
import { scopedMongoose } from '~/db/mongodb';

describe('Monitor Service', () => {

  setLogEnvLevel('info');

  it('should gather and format extraction summary', async () => {
    const config = loadConfig();

    for await (const { mongoose } of scopedMongoose()({ useUniqTestDB: true, config })) {
    }
    // for await (const { mongoQueries } of scopedMongoQueriesWithDeps()({ useUniqTestDB: true })) {
    for await (const { shadowDB, mongoose } of scopedShadowDBWithDeps()({})) {

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
        monitorUpdateInterval,
        config
      })) {
        await monitorService.notify();
      }
    }
  });
});
