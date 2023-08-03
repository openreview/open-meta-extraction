import { getServiceLogger, initConfig, isTestingEnv, prettyFormat, putStrLn } from '@watr/commonlib';
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

export type UseMongooseArgs = {
  emptyDB?: boolean;
  uniqDB?: boolean;
  retainDB?: boolean;
  useMongoose?: Mongoose
}

export type UseMongoose = {
  mongoose: Mongoose
}

export async function* useMongoose({
  emptyDB,
  uniqDB,
  retainDB,
  useMongoose
}: UseMongooseArgs): AsyncGenerator<UseMongoose, void, any> {
  const log = getServiceLogger('useMongoose');
  if (useMongoose) {
    let dbName = useMongoose.connection.name;
    log.info(`Using supplied mongo connection to ${dbName}`);
    yield { mongoose: useMongoose };
    return;
  }

  const config = initConfig();
  const testingOnlyOptions = emptyDB || uniqDB || retainDB;
  const MongoDBName = config.get('mongodb:dbName');
  const isTestDB = /.+test.*/.test(MongoDBName);
  if (isTestingEnv()) {
    log.info(`MongoDB Testing Environ`);
    if (!isTestDB) {
      // throw new Error(`Mongo connection options for ${MongoDBName} incompatible w/non-testing environment; mongo db name must match /.*test.*/`);
      throw new Error(`Mongo db name incompatible w/testing environment; mongo db name must match /.*test.*/`);
    }
    const randomString = randomBytes(3).toString('hex').slice(0, 3);
    const dbSuffix = uniqDB ? '-' + randomString : undefined;
    const mongooseConn = await connectToMongoDB(dbSuffix);
    const dbName = mongooseConn.connection.name;
    log.debug(`mongo db ${dbName} connected...`);
    if (uniqDB) {
      await createCollections();
    } else if (emptyDB) {
      log.debug(`mongo db ${dbName} resetting...`);
      await resetMongoDB();
    }

    try {
      log.debug(`mongo db ${dbName} running client...`);
      yield { mongoose: mongooseConn };
    } finally {

      if (!retainDB) {
        log.debug(`mongo dropping db ${dbName}...`);
        await mongooseConn.connection.dropDatabase()
      }
      log.debug(`mongo closing db ${dbName}...`);
      await mongooseConn.connection.close();
    }
    return;
  }

  log.info(`MongoDB Production Environ`);
  if (isTestDB) {
    throw new Error(`Mongo db name incompatible w/production environment; mongo db name must not match /.*test.*/`);
  }
  if (testingOnlyOptions) {
    throw new Error(`Mongo options are incompatible w/production environment: ${prettyFormat({ emptyDB, uniqDB, retainDB })}`);
  }
  const mongooseConn = await connectToMongoDB();
  try {
    const dbName = mongooseConn.connection.name;
    log.debug(`Yielding mongo db ${dbName}...`);
    yield { mongoose: mongooseConn };
  } finally {
    await mongooseConn.connection.close();
  }


}
