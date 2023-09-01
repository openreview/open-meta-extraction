import _ from 'lodash';
import { addDays } from 'date-fns';
import { PipelineStage, Schema, Types, Model } from 'mongoose';
import { MongoDB } from './mongodb';


export interface CountPerDay {
  day: Date;
  count: number;
}

export const sortByDay: PipelineStage.Sort = {
  $sort: { _id: 1 }
};

export function matchAll(head: PipelineStage.Match, ...clauses: PipelineStage.Match[]): PipelineStage.Match {
  return _.merge({}, head, ...clauses);
}
export function daysfromToday(numOfDays: number): Date {
  return addDays(new Date(), numOfDays);
}

export function matchCreatedAtDaysFromToday(numOfDays: number): PipelineStage.Match {
  const fromDate = addDays(new Date(), numOfDays);
  const clause: PipelineStage.Match = { $match: { createdAt: { $gte: fromDate } } };
  return clause;
}
export function matchFieldVal(field: string, value: string): PipelineStage.Match {
  const obj: Record<string, string> = {};
  obj[field] = value;
  const clause: PipelineStage.Match = { $match: obj };
  return clause;
}

export function countByDay(dateField: string): PipelineStage.Group {
  const countByDayStage: PipelineStage.Group = {
    $group: {
      _id: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: '<unset>',
        }
      },
      count: {
        $sum: 1
      },
    }
  };
  _.set(countByDayStage, ['$group', '_id', '$dateToString', 'date'], `$${dateField}`);
  return countByDayStage;
}


// Fake collection for testing
export interface MyColl {
  _id: Types.ObjectId;
  number: number;
  isValid: boolean;
}

export function initMyColl(mongoDB: MongoDB): Model<MyColl> {
  const schema = new Schema<MyColl>({
    number: { type: Number, required: true, unique: true },
    isValid: { type: Boolean, required: true },
  }, {
    collection: 'my_coll',
  });
  return mongoDB.mongoose.model<MyColl>('MyColl', schema);
}
