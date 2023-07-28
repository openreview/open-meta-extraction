import { getServiceLogger, initConfig, isTestingEnv, putStrLn } from '@watr/commonlib';
import mongoose, { Mongoose } from 'mongoose';
import { createCollections } from '~/db/schemas';
import { randomBytes } from 'crypto';

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
  return mongoose.connect(connstr, { connectTimeoutMS: 5000 });
}

export async function resetMongoDB(): Promise<void> {
  const dbName = mongoose.connection.name;
  putStrLn(`dropping MongoDB ${dbName}`);
  await mongoose.connection.dropDatabase();
  putStrLn('createCollections..');
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
  putStrLn('Using MongoDB Mock Timestamps');
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

export type WithMongoGenArgs = {
  emptyDB?: boolean;
  uniqDB?: boolean;
  retainDB?: boolean;
  useMongoose?: Mongoose
}

export type WithMongoose = {
  mongoose: Mongoose
}

export async function* withMongoGen({
  emptyDB,
  uniqDB,
  retainDB,
  useMongoose
}: WithMongoGenArgs): AsyncGenerator<WithMongoose, void, any> {
  const log = getServiceLogger('withMongoose');
  let mongoose: Mongoose | undefined = useMongoose;
  const externalMongooseConnection = useMongoose !== undefined;
  let dbName = mongoose? mongoose.connection.name : '';
  if (!mongoose) {
    const config = initConfig();
    const MongoDBName = config.get('mongodb:dbName');
    if (!/.+test.*/.test(MongoDBName)) {
      throw new Error(`Tried to reset mongodb ${MongoDBName}; can only reset a db w/name matching /test/`);
    }

    const randomString = randomBytes(3).toString('hex').slice(0, 3);
    const dbSuffix = uniqDB ? '-' + randomString : undefined;
    mongoose = await connectToMongoDB(dbSuffix);

    dbName = mongoose.connection.name;
    log.debug(`mongo db ${dbName} connected...`);
    if (uniqDB) {
      await createCollections();
    } else if (emptyDB) {
      log.debug(`mongo db ${dbName} resetting...`);
      await resetMongoDB();
    }
  }
  try {
    log.debug(`mongo db ${dbName} running client...`);
    yield { mongoose };
  } finally {
    if (externalMongooseConnection) return;

    if (!retainDB) {
      log.debug(`mongo dropping db ${dbName}...`);
      await mongoose.connection.dropDatabase()
    }
    log.debug(`mongo closing db ${dbName}...`);
    await mongoose.connection.close();
  }
}
