import _ from 'lodash';
import { asyncEachOfSeries, setLogEnvLevel } from '@watr/commonlib';
import { taskSchedulerScope } from './task-scheduler';
import { createFakeNote } from '~/db/mock-data';
import { scopedMongoose } from '~/db/mongodb';
import { mongoQueriesExecScope } from '~/db/query-api';
import { shadowDBExecScope, shadowDBConfig } from './shadow-db';

describe('Task Scheduling', () => {
  setLogEnvLevel('warn');

  const shadowConfig = shadowDBConfig();
  const config = shadowConfig.config;
  const _3Notes = _.map(_.range(1, 4), (i) => createFakeNote({
    config,
    noteNumber: i,
    hasAbstract: undefined,
    hasPDFLink: undefined,
    hasHTMLLink: true
  }));

  const middleNote = _3Notes[1];

  it('should schedule old and newly added Urls', async () => {

    for await (const { mongoDB } of scopedMongoose()(shadowConfig)) {
      for await (const { mongoQueries } of mongoQueriesExecScope()({ mongoDB })) {
        for await (const { shadowDB } of shadowDBExecScope()({ mongoQueries, ...shadowConfig })) {
          for await (const { taskScheduler } of taskSchedulerScope()({ mongoQueries })) {

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

            // Generator should be exhausted, this next iteration should be a noop
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
