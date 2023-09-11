import _ from 'lodash';

import {
  ConfigProvider,
  composeScopes,
  delay,
  getServiceLogger,
  withScopedExec,
} from '@watr/commonlib';

import { Logger } from 'winston';
import {
  OpenReviewGateway,
  Note,
} from './openreview-gateway';

import { generateFromBatch } from '~/util/generators';
import { ShadowDB, shadowDBExecScope } from './shadow-db';
import * as mh from '~/db/query-clauses';
import { mongoQueriesExecScopeWithDeps } from '~/db/query-api';
import { DBModels } from '~/db/schemas';

type FetchServiceNeeds = {
  shadowDB: ShadowDB,
  config: ConfigProvider,
};

export const scopedFetchService = () => withScopedExec<
  FetchService,
  'fetchService',
  FetchServiceNeeds
>(
  async function init({ shadowDB, config }) {
    const fetchService = new FetchService(shadowDB, config);
    return { fetchService };
  },
  async function destroy() {
  },
);

export const fetchServiceExecScopeWithDeps = () => composeScopes(
  mongoQueriesExecScopeWithDeps(),
  shadowDBExecScope(),
  scopedFetchService()
);

/**
 * Fetch  Notes  from  Openreview  and  store  them  in  a  local  database  for
 * spidering/extraction
 */
export class FetchService {
  log: Logger;
  gate: OpenReviewGateway;
  shadow: ShadowDB;
  config: ConfigProvider;

  constructor(
    shadow: ShadowDB,
    config: ConfigProvider
  ) {
    this.log = getServiceLogger('FetchService');
    this.gate = new OpenReviewGateway(config);
    this.shadow = shadow;
    this.config = config
  }

  // Fetch batches of notes from OpenReview
  async* createNoteBatchGenerator(startingNoteId?: string): AsyncGenerator<Note[], void, void> {
    let curNoteId = startingNoteId;
    while (true) {
      this.log.debug(`generateNoteBatches(from=${curNoteId})`);
      const noteBatch = await this.gate.fetchNotes(curNoteId);
      if (noteBatch === undefined || noteBatch.notes.length === 0) {
        this.log.debug('Exhausted Openreview /notes');
        return;
      }
      this.log.debug(`Fetched ${noteBatch.notes.length} /notes after:${curNoteId} (of ${noteBatch.count} total)`);
      const endNote = noteBatch.notes.at(-1);
      if (endNote === undefined) throw new Error('Unexpected state');
      curNoteId = endNote.id;
      yield noteBatch.notes;
    }
  }

  // Flatten Note[] batches into stream of Note items
  createNoteGenerator(limit: number, startingNoteId?: string): AsyncGenerator<Note, number, void> {
    return generateFromBatch<Note>(this.createNoteBatchGenerator(startingNoteId), limit);
  }

  // Main loop
  async runFetchLoop(limit: number, pauseBeforeExiting: boolean = false) {
    this.log.info('Starting Fetch Service');
    const lastNoteFetched = await this.shadow.mongoQueries.getLastSavedNote();
    const startingNoteId = lastNoteFetched ? lastNoteFetched.id : undefined;
    if (startingNoteId) {
      this.log.info(`Resuming Fetch Service after note ${startingNoteId}`);
    }

    const noteGenerator = this.createNoteGenerator(limit, startingNoteId);
    for await (const note of noteGenerator) {
      await this.shadow.saveNote(note, true);
    }

    this.log.info('FetchLoop complete');

    if (pauseBeforeExiting) {
      // Pause for a given time period, then exit
      // PM2 will relaunch

      const oneSecond = 1000;
      const oneMinute = 60 * oneSecond;
      const oneHour = 60 * oneMinute;
      this.log.info('Delaying for 4 hours before restart');
      await delay(4 * oneHour);
    }
    this.log.info('FetchLoop exiting...');
  }

}


export interface FetchServiceMonitor {
  newNotesPerDay: mh.CountPerDay[]
  totalNoteCount: number;
  notesWithValidURLCount: number;
}
// How many new note records, per day, over past week
// TODO report pause interval/state?
export async function fetchServiceMonitor(dbModels: DBModels): Promise<FetchServiceMonitor> {
  const matchLastWeek = mh.matchCreatedAtDaysFromToday(-7);

  const totalNoteCount = await dbModels.noteStatus.count();
  const res = await dbModels.noteStatus.aggregate([{
    $facet: {
      createdByDay: [matchLastWeek, mh.countByDay('createdAt'), mh.sortByDay],
    }
  }]);

  const notesWithValidURLCount = await dbModels.urlStatus.count();
  const newNotesPerDay = _.map(res[0].createdByDay, ({ _id, count }) => {
    return { day: _id, count };
  });
  return {
    newNotesPerDay,
    totalNoteCount,
    notesWithValidURLCount,
  };
}
