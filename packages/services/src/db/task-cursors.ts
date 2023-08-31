import _ from 'lodash';
import { Logger } from 'winston';
import { Model, Types } from 'mongoose';
import { MongoDB } from './mongodb';

import {
  asyncMapSeries,
  getServiceLogger,
  prettyPrint,
} from '@watr/commonlib';

import { PipelineStage } from 'mongoose';

import {
  TaskCursor,
  DBModels,
  Task
} from './schemas';

export type CursorID = Types.ObjectId;

export type CursorRole =
  'extract-fields/newest'
  | 'extract-fields/all'
  ;

export const CursorRoles: CursorRole[] = [
  'extract-fields/newest',
  'extract-fields/all'
];

export function isCursorRole(s: unknown): s is CursorRole {
  return typeof s === 'string' && _.includes(CursorRoles, s)
}

export class TaskCursors {
  log: Logger;
  mongoDB: MongoDB;
  dbModels: DBModels;

  constructor(mongoDB: MongoDB) {
    this.log = getServiceLogger('TaskCursors');
    this.mongoDB = mongoDB;
    this.dbModels = mongoDB.dbModels;
  }

  conn() {
    return this.mongoDB.mongoose;
  }

  async defineTask<M>(
    taskName: string,
    model: Model<M>,
    matchFilter: PipelineStage.Match
  ): Promise<Task> {
    const collectionName = model.collection.name;
    const created = await this.dbModels.task.create({
      taskName,
      collectionName,
      match: matchFilter
    });
    prettyPrint({ created });
    return created.toObject();
  }

  async getTasks(
    taskName: string,
  ): Promise<Task[]> {
    const tasks = await this.dbModels.task.find({
      taskName
    });
    const taskObjs = tasks.map(t => t.toObject())
    prettyPrint({ taskObjs });
    return taskObjs;
  }

  async createCursor(
    taskName: string
  ): Promise<void> {
    const task = await this.dbModels.task.findOne({taskName})
    prettyPrint({ task })
    if (!task) {
      return;
    }
    const {match, collectionName} = task;
    // const pmatch = JSON.parse(task.match)


  }
  // async createCursor(role: CursorRole, noteId: string): Promise<TaskCursor | undefined> {
  //   // const taskDef = await dbModels.tasks.find({role})
  //   // const { collName, queryParams, sortBy  } = taskDef;
  //   // mongoColl(collName).find({...queryParams}, {...sortBy})
  //   // const noteStatus = await this.findNoteStatusById(noteId);
  //   // if (!noteStatus) return;
  //   const c = await this.dbModels.taskCursor.create(
  //     { role, noteId, noteNumber: noteStatus.number },
  //   );

  //   return c;
  // }


  // async advanceCursor(cursorId: CursorID): Promise<TaskCursor | undefined> {
  //   const current = await this.dbModels.taskCursor.findById(cursorId);
  //   if (!current) return;
  //   const { noteNumber } = current;
  //   const nextNote = await this.getNextNoteWithValidURL(noteNumber);
  //   if (!nextNote) {
  //     await current.deleteOne();
  //     return;
  //   };

  //   const nextCursor = await this.dbModels.taskCursor.findByIdAndUpdate(cursorId,
  //     {
  //       noteId: nextNote.id,
  //       noteNumber: nextNote.number
  //     }, { new: true });

  //   if (!nextCursor) {
  //     return;
  //   };

  //   const c = await this.dbModels.taskCursor.findById(cursorId);
  //   if (c) return c;
  // }

  // async moveCursor(cursorId: CursorID, distance: number): Promise<TaskCursor | string> {
  //   if (distance === 0) {
  //     return 'Cannot move cursor a distance of 0';
  //   }
  //   const direction = distance > 0 ? 'forward' : 'back';
  //   const absDist = Math.abs(distance);
  //   this.log.info(`Moving Cursor ${direction} by ${absDist}`);

  //   const current = await this.dbModels.taskCursor.findById(cursorId);
  //   if (!current) return `No cursor w/id ${cursorId}`;

  //   const { noteNumber } = current;
  //   let currNote = noteNumber;
  //   let notes = await asyncMapSeries(_.range(absDist), async () => {
  //     if (distance > 0) {
  //       const n = await this.getNextNoteWithValidURL(currNote);
  //       if (!n) return undefined;
  //       currNote = n.number;
  //       return n;
  //     }
  //     const n = await this.getPrevNoteWithValidURL(currNote);
  //     if (!n) return undefined;
  //     currNote = n.number;
  //     return n;
  //   });

  //   notes = _.flatMap(notes, (n) => _.isUndefined(n) ? [] : [n]);

  //   if (notes.length < absDist) {
  //     return `Too few notes (${notes.length} found) to move ${direction} from note:${current.noteId}, #${current.noteNumber}`;
  //   }

  //   const lastNote = notes.at(-1);
  //   if (!lastNote) {
  //     throw Error('Error: notes are empty');
  //   }

  //   const nextCursor = await this.dbModels.taskCursor.findByIdAndUpdate(cursorId,
  //     {
  //       noteId: lastNote.id,
  //       noteNumber: lastNote.number
  //     }, { new: true });

  //   if (!nextCursor) {
  //     return 'No next cursor';
  //   };

  //   return nextCursor;
  // }

  async getCursor(role: CursorRole): Promise<TaskCursor | undefined> {
    const cursor = await this.dbModels.taskCursor.findOne({ role });
    if (cursor === null || cursor === undefined) {
      return;
    }
    return cursor;
  }

  async getCursors(): Promise<TaskCursor[]> {
    return this.dbModels.taskCursor.find();
  }

  async deleteCursor(role: CursorRole): Promise<boolean> {
    const cursor = await this.dbModels.taskCursor.findOneAndRemove({ role });
    return cursor !== null;
  }

  async deleteCursors(): Promise<void> {
    const cursors = await this.dbModels.taskCursor.find();
    this.log.info(`Deleting ${cursors.length} cursors`);
    await Promise.all(cursors.map(async c => c.deleteOne()))
  }

  async updateCursor(role: CursorRole, noteId: string): Promise<TaskCursor> {
    return this.dbModels.taskCursor.findOneAndUpdate(
      { role },
      { role, noteId },
      { new: true, upsert: true }
    );
  }


}
