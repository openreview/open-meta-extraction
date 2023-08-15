import _ from 'lodash';
import { asyncEachOfSeries, setLogEnvLevel } from '@watr/commonlib';
import { monitorServiceExecScope } from './monitor-service';
import { FieldFrequencies, createFakeNoteList } from '~/db/mock-data';
import { Note } from './openreview-gateway';
import { shadowDBExecScopeWithDeps, shadowDBConfig } from './shadow-db';

describe('Monitor Service', () => {

  setLogEnvLevel('warn');

  it('should gather and format extraction summary', async () => {
    const shadowConfig = shadowDBConfig();
    const config = shadowConfig.config;


    for await (const { shadowDB, mongoDB } of shadowDBExecScopeWithDeps()(shadowConfig)) {

      const noteCount = 5;

      const fieldFrequencies: FieldFrequencies = {
        validHtmlLinkFreq: [4, 5],
        abstractFreq: [1, 2],
        pdfLinkFreq: [1, 3]
      };
      const notes = createFakeNoteList(config, noteCount, fieldFrequencies, 1);
      await asyncEachOfSeries(notes, async (n: Note, i: number) => {
        // const httpStatus = 200;
        // const response = 'http://response.info/';
        await shadowDB.saveNote(n, true);
        const noteId = n.id;
        const theAbstract = 'Ipsem..'
        const pdf = 'http://some/paper.pdf';
        const urlStatus = await shadowDB.mongoQueries.findUrlStatusById(noteId);
        if (!urlStatus) {
          return;
        }

        if (urlStatus.hasAbstract) {
          await shadowDB.updateFieldStatus(noteId, 'abstract', theAbstract);
        }
        if (urlStatus.hasPdfLink) {
          await shadowDB.updateFieldStatus(noteId, 'pdf', pdf);
        }
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
        expect(summary.extractionSummary).toMatchObject(
          { abstractCount: 2, pdfCount: 2, newAbstracts: [{ count: 2 }], newPdfLinks: [{ count: 2 }] }
        )
        expect(summary.fetchSummary).toMatchObject(
          { newNotesPerDay: [{ count: 5 }], notesWithValidURLCount: 4, totalNoteCount: 5 }
        )

      }
    }
  });
});
