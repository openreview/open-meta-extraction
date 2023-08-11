/*
 * REST communication with OpenReview
*/

import _ from 'lodash';

import {
  ConfigProvider,
  asyncEachOfSeries,
  getServiceLogger, prettyPrint
} from '@watr/commonlib';
import { Logger } from 'winston';

import {
  OpenReviewExchange,
} from './openreview-exchange';


export interface NoteContent {
  'abstract'?: string;
  pdf?: string;
  html?: string; // this is a URL
  venueid: string;
  title: string;
  authors: string[];
  tcdate: number;
  authorids: string[];
  venue: string;
  _bibtex: string;
}

export interface Note {
  id: string;
  number: number,
  cdate: number,
  mdate: number,
  tcdate: number,
  tmdate: number,
  content: NoteContent;
}

export interface Notes {
  notes: Note[];
  count: number;
}

export interface MessagePostData {
  subject: string;
  message: string,
  groups: string[];
}

const OpenreviewStatusGroup = 'OpenReview.net/Status';


const UpdateInvitations = {
  abstract: 'dblp.org/-/abstract',
  pdf: 'dblp.org/-/pdf',
};

export type UpdatableField = keyof typeof UpdateInvitations;

export class OpenReviewGateway {
  log: Logger;
  opex: OpenReviewExchange;
  config: ConfigProvider;

  constructor(config: ConfigProvider) {
    this.log = getServiceLogger('OpenReviewGateway');
    this.config = config
    this.opex = new OpenReviewExchange(config);
  }

  async fetchNotes(afterNoteId?: string): Promise<Notes | undefined> {
    const queryParams: Record<string, string> = { invitation: 'dblp.org/-/record', sort: 'number:asc' };
    if (afterNoteId) {
      queryParams.after = afterNoteId;
    }
    return this.opex.apiGET<Notes>('/notes', queryParams);
  }

  async updateFieldStatus(
    noteId: string,
    fieldName: UpdatableField,
    fieldValue: string
  ): Promise<void> {
    const content: Record<string, string> = {};
    content[fieldName] = fieldValue;
    const invitation = UpdateInvitations[fieldName];
    const noteUpdate = {
      referent: noteId,
      content,
      invitation,
      readers: ['everyone'],
      writers: [],
      signatures: ['dblp.org']
    };
    this.log.info(`POSTing updated note ${noteId}`);

    await this.opex.apiPOST<typeof noteUpdate, Note>('/notes', noteUpdate)
      .then(updatedNote => {
        if (!updatedNote) {
          this.log.error(`error updating note Note ${noteId}`);
          return;
        }
        this.log.info(`updated Note.${fieldName} ${noteId}; updateId: ${updatedNote.id}`);
        this.log.info(`      = '${fieldValue.slice(0, 75)} ...'`);
        return;
      });
  }

  /**
   * Send status notifications
   * The body of the request requires
   * { subject: <Some Status Title>, message: <Body>, groups: [ 'OpenReview.net/Status' ] }
   */
  async postStatusMessage(subject: string, message: string): Promise<void> {
    const mp = makeMessagePost(subject, message);
    this.log.info(`Sending message ${mp.subject}`);
    await this.opex.apiPOST('/messages', mp);
    this.log.info(`Sent message ${mp.subject}`);
  }

  async testNoteFetching() {
    let startingNote: string | undefined;
    const noteList: any[][] = [];
    await asyncEachOfSeries(_.range(5), async () => {
      const notes = await this.fetchNotes(startingNote);

      if (notes) {
        const abbrevNotes = notes.notes.map(note => {
          const { id, number, cdate, tcdate, mdate, tmdate } = note;
          const mdateHr = fmtTime(mdate);
          const cdateHr = fmtTime(cdate);
          const tcdateHr = fmtTime(tcdate);
          const tmdateHr = fmtTime(tmdate);
          return {
            id, number, mdateHr, tmdateHr, cdateHr, tcdateHr
          };
        });
        const first10 = abbrevNotes.slice(0, 10);
        noteList.push(first10);
        startingNote = first10[0].id;
      }
    });
    const zipped = _.zip(noteList);
    prettyPrint({ zipped });
  }
}

/**
 * Construct a status message
 *   The body of the request requires
 *   { subject: <Some Status Title>, message: <Body>, groups: [ 'OpenReview.net/Status' ] }
 */
function makeMessagePost(subject: string, message: string): MessagePostData {
  return {
    subject,
    message,
    groups: [OpenreviewStatusGroup]
  };
}

export function fmtTime(unixTimestamp: number): string {
  const a = new Date(unixTimestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = a.getFullYear();
  const month = months[a.getMonth()];
  const date = a.getDate();
  const hour = a.getHours();
  const min = a.getMinutes();
  const sec = a.getSeconds();
  const time = `${date} ${month} ${year} ${hour}:${min}:${sec}`;
  return time;
}
