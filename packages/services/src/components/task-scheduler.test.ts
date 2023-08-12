import _ from 'lodash';
import { asyncEachOfSeries, loadConfig, setLogEnvLevel } from '@watr/commonlib';
import { scopedTaskScheduler } from './task-scheduler';
import { createFakeNote } from '~/db/mock-data';
import { scopedMongoose } from '~/db/mongodb';
import { mongoQueriesExecScope } from '~/db/query-api';
import { scopedShadowDB } from './shadow-db';

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

    const config = loadConfig();
    for await (const { mongoose } of scopedMongoose()({ useUniqTestDB: true, config })) {
      for await (const { mongoQueries } of mongoQueriesExecScope()({ mongoose })) {
        for await (const { shadowDB } of scopedShadowDB()({ mongoQueries, config })) {
          for await (const { taskScheduler } of scopedTaskScheduler()({ mongoQueries })) {

            // Populate db
            await asyncEachOfSeries(_3Notes, async note => await shadowDB.saveNote(note, true));
            // Set middle note to success
            // const updatedUrl = await mongoQueries.updateUrlStatus(middleNote.id, { response: middleNote.content.html })
            // expect(updatedUrl).toMatchObject({ noteId: 'note#2', response: middleNote.content.html });
            const updatedUrl = await mongoQueries.updateUrlStatus(middleNote.id, { hasAbstract: true });
            expect(updatedUrl).toMatchObject({ noteId: 'note#2', hasAbstract: true });
            // verify
            const lastSuccessfulExtraction = await mongoQueries.getLastNoteWithSuccessfulExtractionV2();
            expect(lastSuccessfulExtraction).toMatchObject({ id: 'note#2', url: middleNote.content.html });


            await taskScheduler.createUrlCursor('extract-fields/all');
            await taskScheduler.createUrlCursor('extract-fields/newest');
            const cursors = await mongoQueries.getCursors();

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
        }
      }
    }
  });
});
