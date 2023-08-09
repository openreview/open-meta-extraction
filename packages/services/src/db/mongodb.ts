import { getServiceLogger, initConfig, isTestingEnv, withScopedResource, prettyFormat, putStrLn, isEnvMode, combineScopedResources, withGracefulExit } from '@watr/commonlib';
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
  currentFakeDate.setDate(currentFakeDate.getDate() - 7);
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

type UseMongooseArgs = {
  isProductionDB?: boolean;
  useUniqTestDB?: boolean;
  retainTestDB?: boolean;
}


function makeRndStr(len: number): string {
  return randomBytes(len).toString('hex').slice(0, len);
}

export const scopedMongoose = withScopedResource<
  Mongoose,
  'mongoose',
  UseMongooseArgs
>(
  'mongoose',
  async function init({ isProductionDB, useUniqTestDB, retainTestDB }) {
    const log = getServiceLogger('useMongoose');
    const config = initConfig();

    const MongoDBName = config.get('mongodb:dbName');
    const isTestDBName = /.+test.*/.test(MongoDBName);
    const isDevDBName = /.+dev.*/.test(MongoDBName);
    const isValidTestDB = isEnvMode('test') && isTestDBName;
    const isValidDevDB = isEnvMode('dev') && isDevDBName;
    const isValidProdDB = isProductionDB && isEnvMode('prod') && !(isTestDBName || isDevDBName);

    if (isValidProdDB) {
      log.info(`MongoDB Production Environ`);
      const mongooseConn = await connectToMongoDB();
      return { mongoose: mongooseConn };
    }
    if (isValidDevDB) {
      log.info(`MongoDB Dev Environ`);
      const mongooseConn = await connectToMongoDB();
      return { mongoose: mongooseConn };
    }

    if (isValidTestDB) {
      log.info(`MongoDB Testing Environ`);
      const dbSuffix = useUniqTestDB ? '-' + makeRndStr(3) : undefined;
      const mongooseConn = await connectToMongoDB(dbSuffix);
      const dbName = mongooseConn.connection.name;
      log.debug(`mongo db ${dbName} connected...`);
      if (useUniqTestDB) {
        await createCollections();
      }

      return { mongoose: mongooseConn };
    }

    throw new Error(`Mongo db init: db name is not valid for dev,test,or prod environments`);
  },
  async function destroy({ mongoose, isProductionDB, useUniqTestDB, retainTestDB }) {
    const MongoDBName = mongoose.connection.name;

    if (isProductionDB) {
      putStrLn(`mongo closing db ${MongoDBName}...`);
      return mongoose.connection.close();
    }

    const isTestDBName = /.+test.*/.test(MongoDBName);
    const isValidTestDB = isEnvMode('test') && isTestDBName;
    if (isValidTestDB &&  useUniqTestDB && !retainTestDB) {
      putStrLn(`mongo dropping db ${MongoDBName}...`);
      await mongoose.connection.dropDatabase()
    }
    putStrLn(`mongo closing db ${MongoDBName}...`);
    await mongoose.connection.close();
  }
)

export const scopedMongooseWithDeps = combineScopedResources(withGracefulExit, scopedMongoose);
