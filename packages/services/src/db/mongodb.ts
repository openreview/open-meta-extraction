import { getServiceLogger, initConfig, isTestingEnv, putStrLn } from '@watr/commonlib';
import mongoose, { Mongoose } from 'mongoose';

import { createCollections } from '~/db/schemas';
import { randomBytes } from 'crypto';
import { Logger } from 'winston';

let _log: Logger | undefined;

function log(): Logger {
  if (_log) return _log;
  putStrLn('log():create')
  return _log = getServiceLogger('MongoDB');
}

export function mongoConnectionString(dbNameMod?: string): string {
  const config = initConfig();
  const ConnectionURL = config.get('mongodb:connectionUrl');
  const MongoDBName = config.get('mongodb:dbName');
  const dbName = dbNameMod ? MongoDBName + dbNameMod : MongoDBName;
  const connectUrl = `${ConnectionURL}/${dbName}`;
  return connectUrl;
}

export async function connectToMongoDB(dbNameMod?: string): Promise<Mongoose> {
  const connstr = mongoConnectionString(dbNameMod);
  log().debug(`connecting to ${connstr}`);
  return mongoose.connect(connstr, { connectTimeoutMS: 5000 });
}

export async function resetMongoDB(): Promise<void> {
  const dbName = mongoose.connection.name;
  log().debug(`dropping MongoDB ${dbName}`);
  await mongoose.connection.dropDatabase();
  log().debug('createCollections..');
  await createCollections();
}


interface CurrentTimeOpt {
  currentTime(): Date;
}

export function createCurrentTimeOpt(): CurrentTimeOpt {
  if (!isTestingEnv()) {
    const defaultOpt: CurrentTimeOpt = {
      currentTime: () => new Date()
    };
    return defaultOpt;
  }
  log().debug('Using MongoDB Mock Timestamps');
  const currentFakeDate = new Date();
  currentFakeDate.setDate(currentFakeDate.getDate() - 14);
  const mockedOpts: CurrentTimeOpt = {
    currentTime: () => {
      const currDate = new Date(currentFakeDate);
      const rando = Math.floor(Math.random() * 10) + 1;
      const jitter = rando % 4;
      currentFakeDate.setHours(currentFakeDate.getHours() + jitter);
      return currDate;
    }
  };
  return mockedOpts;
}

type RunWithMongo = (m: Mongoose) => Promise<void>;
type WithMongoArgs = {
  run: RunWithMongo;
  emptyDB?: boolean;
  uniqDB?: boolean;
  retainDB?: boolean;
}

export async function withMongo(args: WithMongoArgs): Promise<void> {
  const { run } = args;

  for await (const mongoose of withMongoGen(args)) {
    await run(mongoose);
  }
}

type WithMongoGenArgs = {
  emptyDB?: boolean;
  uniqDB?: boolean;
  retainDB?: boolean;
}

export async function* withMongoGen({
  emptyDB,
  uniqDB,
  retainDB
}: WithMongoGenArgs): AsyncGenerator<Mongoose, void, any> {
  const config = initConfig();
  const MongoDBName = config.get('mongodb:dbName');
  if (!/.+test.*/.test(MongoDBName)) {
    throw new Error(`Tried to reset mongodb ${MongoDBName}; can only reset a db w/name matching /test/`);
  }

  const randomString = randomBytes(3).toString('hex').slice(0, 3);
  const dbSuffix = uniqDB ? '-' + randomString : undefined;
  const mongoose = await connectToMongoDB(dbSuffix);

  const dbName = mongoose.connection.name;
  log().debug(`mongo db ${dbName} connected...`);
  if (uniqDB) {
    await createCollections();
  }
  if (emptyDB) {
    log().debug(`mongo db ${dbName} resetting...`);
    await resetMongoDB();
  }
  try {
    log().debug(`mongo db ${dbName} running client...`);
    yield mongoose;
  } finally {
    if (!retainDB) {
      log().debug(`mongo dropping db ${dbName}...`);
      await mongoose.connection.dropDatabase()
    }
    log().debug(`mongo closing db ${dbName}...`);
    await mongoose.connection.close();
  }
}
