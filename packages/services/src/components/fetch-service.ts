import _ from 'lodash';

import {
  delay,
  getServiceLogger
} from '@watr/commonlib';

import { Logger } from 'winston';
import {
  OpenReviewGateway,
  Note,
} from './openreview-gateway';

import { generateFromBatch } from '~/util/generators';
import { ShadowDB, WithShadowDB, withShadowDB } from './shadow-db';
import { WithMongoGenArgs } from '~/db/mongodb';

export type WithFetchService = WithShadowDB & {
  fetchService: FetchService
};

type WithFetchServiceArgs = WithMongoGenArgs;

export async function* withFetchService(args: WithFetchServiceArgs): AsyncGenerator<WithFetchService, void, any> {
  for await (const components of withShadowDB(args)) {
    const { shadowDB } = components;
    const fetchService =  new FetchService(shadowDB);
    yield _.merge({}, components, { fetchService });
  }
}

/**
 * Fetch  Notes  from  Openreview  and  store  them  in  a  local  database  for
 * spidering/extraction
 */
export class FetchService {
  log: Logger;
  gate: OpenReviewGateway;
  shadow: ShadowDB;

  constructor(shadow: ShadowDB) {
    this.log = getServiceLogger('FetchService');
    this.gate = new OpenReviewGateway();
    this.shadow = shadow;
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

  createNoteGenerator(startingNoteId?: string, limit?: number): AsyncGenerator<Note, number, void> {
    return generateFromBatch<Note>(this.createNoteBatchGenerator(startingNoteId), limit || 0);
  }

  async updateFetchCursor(noteId: string) {
    return this.shadow.updateLastFetchedNote(noteId);
  }

  async getFetchCursor() {
    return this.shadow.getLastFetchedNote();
  }


  // Main loop
  async runFetchLoop(limit?: number) {
    limit = _.isNumber(limit) && limit > 0 ? limit : undefined;
    this.log.info('Starting Fetch Service');
    const lastNoteFetched = await this.shadow.mdb.getLastSavedNote();
    const startingNoteId = lastNoteFetched ? lastNoteFetched.id : undefined;
    if (startingNoteId) {
      this.log.info(`Resuming Fetch Service after note ${startingNoteId}`);
    }

    const noteGenerator = this.createNoteGenerator(startingNoteId, limit);

    let cur = await noteGenerator.next();
    for (; !cur.done; cur = await noteGenerator.next()) {
      const note = cur.value;
      await this.shadow.saveNote(note, true);
      await this.updateFetchCursor(note.id);
    }
    this.log.info('FetchLoop complete');
    if (limit === 0) {
      // Pause for a given time period, then exit
      // PM2 will relaunch

      const oneSecond = 1000;
      const oneMinute = 60 * oneSecond;
      const oneHour = 60 * oneMinute;
      this.log.info('Delaying for 4 hours before restart');
      await delay(4 * oneHour);
    }
  }
}
