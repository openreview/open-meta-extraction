import _ from 'lodash';
import { asyncEachOfSeries, setLogEnvLevel } from '@watr/commonlib';
import { withTaskScheduler } from './task-scheduler';
import { createFakeNote } from '~/db/mock-data';

describe('Task Scheduling', () => {
  setLogEnvLevel('warn');

  const _3Notes = _.map(_.range(1, 4), (i) => createFakeNote({
    noteNumber: i,
    hasAbstract: false,
    hasPDFLink: false,
    hasHTMLLink: true
  }));

  const middleNote = _3Notes[1];

  it('should schedule old and newly added Urls', async () => {
    for await (const { taskScheduler, mdb, shadowDB } of withTaskScheduler({ uniqDB: true })) {

      // Populate db
      await asyncEachOfSeries(_3Notes, async note => await shadowDB.saveNote(note, true));
      // Set middle note to success
      const updatedUrl = await mdb.updateUrlStatus(middleNote.id, { response: middleNote.content.html })
      expect(updatedUrl).toMatchObject({ noteId: 'note#2', response: middleNote.content.html });
      // verify
      const lastSuccessfulExtraction = await mdb.getLastNoteWithSuccessfulExtraction();
      expect(lastSuccessfulExtraction).toMatchObject({ id: 'note#2', url: middleNote.content.html });


      await taskScheduler.createUrlCursor('extract-fields/all');
      await taskScheduler.createUrlCursor('extract-fields/newest');
      const cursors = await mdb.getCursors();

      // Cursors set to first valid/last successful+1
      expect(cursors).toMatchObject([
        {
          noteId: 'note#1',
          noteNumber: 1,
          role: 'extract-fields/all',
        },
        {
          noteId: 'note#3',
          noteNumber: 3,
          role: 'extract-fields/newest',
        }
      ]);

      const schedulerOrder: string[] = [];

      for await (const url of taskScheduler.genUrlStream()) {
        schedulerOrder.push(url.noteId);
      }
      expect(schedulerOrder).toMatchObject(['note#3', 'note#1', 'note#2', 'note#3']);
    }
  });
});
