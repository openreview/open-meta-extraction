// import mongoose, { Mongoose } from 'mongoose';
import * as mg from 'mongoose';
import { randomBytes } from 'crypto';

import { createCollections } from '~/db/schemas';
import {
  getServiceLogger,
  isTestingEnv,
  withScopedExec,
  putStrLn,
  isEnvMode,
  ConfigProvider,
  composeScopes,
  gracefulExitExecScope,
  loadConfig
} from '@watr/commonlib';
import { Logger } from 'winston';

export function mongoConnectionString(config: ConfigProvider, dbNameMod?: string): string {
  const ConnectionURL = config.get('mongodb:connectionUrl');
  const MongoDBName = config.get('mongodb:dbName');
  const dbName = dbNameMod ? MongoDBName + dbNameMod : MongoDBName;
  const connectUrl = `${ConnectionURL}/${dbName}`;
  return connectUrl;
}

export async function connectToMongoDB(config: ConfigProvider, dbNameMod?: string): Promise<mg.Mongoose> {
  const connstr = mongoConnectionString(config, dbNameMod);
  return mg.connect(connstr, { connectTimeoutMS: 5000 });
}

export async function resetMongoDB(): Promise<void> {
  const dbName = mg.connection.name;
  putStrLn(`dropping MongoDB ${dbName}`);
  await mg.connection.dropDatabase();
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

export type MongoDBNeeds = {
  isProductionDB: boolean;
  useUniqTestDB?: boolean;
  retainTestDB?: boolean;
  config: ConfigProvider;
}


function makeRndStr(len: number): string {
  return randomBytes(len).toString('hex').slice(0, len);
}

export class MongoDB {
  mongoose: mg.Mongoose;
  config: ConfigProvider;
  log: Logger;

  constructor(
    mongoose: mg.Mongoose,
    config: ConfigProvider,
    log: Logger
  ) {
    this.config = config;
    this.log = log;
    this.mongoose = mongoose;
  }
}

export const scopedMongoose = () => withScopedExec<MongoDB, 'mongoDB', MongoDBNeeds>(
  async function init({ config, isProductionDB, useUniqTestDB }) {
    const log = getServiceLogger('useMongoose');

    const MongoDBName = config.get('mongodb:dbName');
    const isTestDBName = /.+test.*/.test(MongoDBName);
    const isDevDBName = /.+dev.*/.test(MongoDBName);
    const isValidTestDB = isEnvMode('test') && isTestDBName;
    const isValidDevDB = isEnvMode('dev') && isDevDBName;
    const isValidProdDB = isProductionDB && isEnvMode('prod') && !(isTestDBName || isDevDBName);

    if (isValidProdDB) {
      log.info(`MongoDB Production Environ`);
      const mongooseConn = await connectToMongoDB(config);
      return { mongoDB: new MongoDB(mongooseConn, config, log) };
    }
    if (isValidDevDB) {
      log.info(`MongoDB Dev Environ`);
      const mongooseConn = await connectToMongoDB(config);
      return { mongoDB: new MongoDB(mongooseConn, config, log) };
    }

    if (isValidTestDB) {
      log.info(`MongoDB Testing Environ`);
      if (useUniqTestDB === undefined) {

        throw new Error(`Mongo test db init: must explicitly set useUniqTestDB: true/false`);
      }
      const dbSuffix = useUniqTestDB ? '-' + makeRndStr(3) : undefined;
      const mongooseConn = await connectToMongoDB(config, dbSuffix);
      const dbName = mongooseConn.connection.name;
      log.debug(`mongo db ${dbName} connected...`);
      if (useUniqTestDB) {
        await createCollections();
      }

      return { mongoDB: new MongoDB(mongooseConn, config, log) };
    }

    throw new Error(`Mongo db init: db name is not valid for dev,test,or prod environments`);
  },
  async function destroy({ mongoDB, isProductionDB, useUniqTestDB, retainTestDB }) {
    const MongoDBName = mongoDB.mongoose.connection.name;

    if (isProductionDB) {
      putStrLn(`mongo closing db ${MongoDBName}...`);
      return mongoDB.mongoose.connection.close();
    }

    const isTestDBName = /.+test.*/.test(MongoDBName);
    const isValidTestDB = isEnvMode('test') && isTestDBName;
    if (isValidTestDB && useUniqTestDB && !retainTestDB) {
      putStrLn(`mongo dropping db ${MongoDBName}...`);
      await mongoDB.mongoose.connection.dropDatabase()
    }
    putStrLn(`mongo closing db ${MongoDBName}...`);
    await mongoDB.mongoose.connection.close();
  }
)

export const mongooseExecScopeWithDeps = () => composeScopes(
  gracefulExitExecScope(),
  scopedMongoose()
);


export function mongoTestConfig(): MongoDBNeeds {
  const config = loadConfig();
  const args = { isProductionDB: false, useUniqTestDB: true, config }
  return args;
}

export function mongoProductionConfig(): MongoDBNeeds {
  const config = loadConfig();
  const args = { isProductionDB: true, config }
  return args;
}
