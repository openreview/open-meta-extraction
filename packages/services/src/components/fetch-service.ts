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
import { ShadowDB } from './shadow-db';


export async function createFetchService(
  shadow?: ShadowDB
): Promise<FetchService> {
  const s = new FetchService(shadow);
  await s.connect();
  return s;
}

export class FetchService {
  log: Logger;
  gate: OpenReviewGateway;
  shadow: ShadowDB;

  constructor(
    shadow?: ShadowDB
  ) {
    this.log = getServiceLogger('FetchService');
    this.gate = new OpenReviewGateway();
    this.shadow = shadow || new ShadowDB();
  }

  async connect() {
    await this.shadow.connect();
  }

  async close() {
    await this.shadow.close();
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


  async runFetchLoop(limit?: number) {
    limit = _.isNumber(limit) && limit > 0 ? limit : undefined;
    this.log.info('Starting Fetch Service');
    const startingNote = await this.getFetchCursor();
    const startingNoteId = startingNote ? startingNote.noteId : undefined;
    if (startingNoteId) {
      this.log.info(`Resuming Fetch Service from note ${startingNoteId}`);
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
