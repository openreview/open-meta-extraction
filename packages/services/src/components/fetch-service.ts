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
import { ShadowDB, scopedShadowDBWithDeps } from './shadow-db';

type FetchServiceNeeds = {
  shadowDB: ShadowDB,
  config: ConfigProvider,
};

export const scopedFetchService = () => withScopedExec<
  FetchService,
  'fetchService',
  FetchServiceNeeds
>(
  'fetchService',
  async function init({ shadowDB, config }) {
    const fetchService = new FetchService(shadowDB, config);
    return { fetchService };
  },
  async function destroy() {
  },
);

export const scopedFetchServiceWithDeps = () => composeScopes(
  scopedShadowDBWithDeps(),
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

  createNoteGenerator(limit: number, startingNoteId?: string): AsyncGenerator<Note, number, void> {
    return generateFromBatch<Note>(this.createNoteBatchGenerator(startingNoteId), limit);
  }


  // Main loop
  async runFetchLoop(limit: number, pauseBeforeExiting: boolean = false) {
    this.log.info('Starting Fetch Service');
    const lastNoteFetched = await this.shadow.mdb.getLastSavedNote();
    const startingNoteId = lastNoteFetched ? lastNoteFetched.id : undefined;
    if (startingNoteId) {
      this.log.info(`Resuming Fetch Service after note ${startingNoteId}`);
    }

    const noteGenerator = this.createNoteGenerator(limit, startingNoteId);

    let cur = await noteGenerator.next();
    for (; !cur.done; cur = await noteGenerator.next()) {
      const note = cur.value;
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

import { NoteStatus } from '~/db/schemas';
import * as mh from '~/db/mongo-helpers';

export interface FetchServiceMonitor {
  newNotesPerDay: mh.CountPerDay[]
}
// How many new note records, per day, over past week (histogram)
export async function fetchServiceMonitor(): Promise<FetchServiceMonitor> {
  const matchLastWeek = mh.matchCreatedAtDaysFromToday(-7);

  const res = await NoteStatus.aggregate([{
    $facet: {
      createdByDay: [matchLastWeek, mh.countByDay('createdAt'), mh.sortByDay],
    }
  }]);

  const byDay = _.map(res[0].createdByDay, ({ _id, count }) => {
    return { day: _id, count };
  });
  return { newNotesPerDay: byDay }
}
