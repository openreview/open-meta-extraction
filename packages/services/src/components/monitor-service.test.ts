import _ from 'lodash';
import { asyncEachOfSeries, setLogEnvLevel } from '@watr/commonlib';
import { monitorServiceExecScope } from './monitor-service';
import { FieldFrequencies, createFakeNoteList } from '~/db/mock-data';
import { Note } from './openreview-gateway';
import { shadowDBExecScopeWithDeps, shadowDBConfig } from './shadow-db';

describe('Monitor Service', () => {

  setLogEnvLevel('debug');

  it('should gather and format extraction summary', async () => {
    const shadowConfig = shadowDBConfig();
    const config = shadowConfig.config;


    for await (const { shadowDB, mongoDB } of shadowDBExecScopeWithDeps()(shadowConfig)) {

      const noteCount = 15;

      const fieldFrequencies: FieldFrequencies = {
        validHtmlLinkFreq: [4, 5],
        abstractFreq: [1, 2],
        pdfLinkFreq: [1, 3]
      };
      const notes = createFakeNoteList(config, noteCount, fieldFrequencies, 1);
      await asyncEachOfSeries(notes, async (n: Note, i: number) => {
        await shadowDB.saveNote(n, true);
        const noteId = n.id;
        const urlStatus = await shadowDB.mongoQueries.findUrlStatusById(noteId);
        if (!urlStatus) {
          return;
        }
        const { hasAbstract, hasPdfLink } = urlStatus;
        urlStatus.validResponseUrl = hasAbstract || hasPdfLink ;
        const hostGroup = i % 3;
        urlStatus.responseHost= `http://domain${hostGroup}.org/`;

        await urlStatus.save();
      });

      const sendNotifications = false;
      const monitorUpdateInterval = 0;
      const monitorNotificationInterval = 0;

      for await (const { monitorService } of monitorServiceExecScope()({
        ...shadowConfig,
        mongoDB,
        sendNotifications,
        monitorNotificationInterval,
        monitorUpdateInterval,
      })) {
        await monitorService.notify();
        const summary = monitorService.lastSummary;
        if (!summary) {
          throw Error('No summary generated');
        }
        // expect(summary.extractionSummary).toMatchObject(
        //   { abstractCount: 2, pdfCount: 2, newAbstracts: [{ count: 2 }], newPdfLinks: [{ count: 2 }] }
        // )
        // expect(summary.fetchSummary).toMatchObject(
        //   { newNotesPerDay: [{ count: 5 }], notesWithValidURLCount: 4, totalNoteCount: 5 }
        // )

      }
    }
  });
});
