/**
 * Basic MongoDB connection logic
 * Configuration options for testing
 *   - Creating uniq per-test databases
 *   - Mocking timestamps
 */


import * as mg from 'mongoose';
import { randomBytes } from 'crypto';

import { DBModels, defineDBModels } from '~/db/schemas';
import {
  getServiceLogger,
  isTestingEnv,
  withScopedExec,
  putStrLn,
  isEnvMode,
  ConfigProvider,
  composeScopes,
  gracefulExitExecScope,
  loadConfig,
  isProdEnv
} from '@watr/commonlib';
import { Logger } from 'winston';
export function mongoConnectionString(config: ConfigProvider, dbNameMod?: string): string {
  const ConnectionURL = config.get('mongodb:connectionUrl');
  const MongoDBName = config.get('mongodb:dbName');
  const dbName = dbNameMod ? MongoDBName + dbNameMod : MongoDBName;
  const connectUrl = `${ConnectionURL}/${dbName}`;
  return connectUrl;
}

export async function connectToMongoDB(config: ConfigProvider, dbNameMod?: string): Promise<mg.Connection> {
  const connstr = mongoConnectionString(config, dbNameMod);
  return mg.createConnection(connstr, { connectTimeoutMS: 5000 });
}


export interface CurrentTimeOpt {
  currentTime(): Date;
}
export class MockCurrentTimeOpt implements CurrentTimeOpt {
  lastTime: Date;
  constructor(d: Date) {
    this.lastTime = d;
  }
  currentTime(): Date {
    const rando = Math.floor(Math.random() * 10) + 1;
    const jitter = rando % 4;
    const nextTime = addHours(this.lastTime, jitter);
    this.lastTime = nextTime;
    return nextTime;
  }
}

export const DefaultCurrentTimeOpt: CurrentTimeOpt = {
  currentTime: () => new Date()
};

import { addHours, addDays } from 'date-fns';

export function mockCurrentTimeOpt(): CurrentTimeOpt {
  putStrLn('Using MongoDB Mock Timestamps');
  const startTime = addDays(new Date(), -7);
  return new MockCurrentTimeOpt(startTime);
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
  mongoose: mg.Connection;
  config: ConfigProvider;
  dbModels: DBModels;
  log: Logger;

  constructor(
    mongoose: mg.Connection,
    config: ConfigProvider,
    dbModels: DBModels,
    log: Logger
  ) {
    this.config = config;
    this.log = log;
    this.mongoose = mongoose;
    this.dbModels = dbModels;
  }

  async dropDatabase() {
    const dbName = this.mongoose.name;
    putStrLn(`dropping MongoDB ${dbName}`);
    await this.mongoose.dropDatabase();
  }

  async createCollections() {
    await this.dbModels.noteStatus.createCollection();
    await this.dbModels.urlStatus.createCollection();
    await this.dbModels.task.createCollection();
    await this.dbModels.fieldStatus.createCollection();
  }
  async unsafeResetD() {
    await this.dropDatabase();
    await this.createCollections();
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
      const dbModels = defineDBModels(mongooseConn);
      return { mongoDB: new MongoDB(mongooseConn, config, dbModels, log) };
    }
    if (isValidDevDB) {
      log.info(`MongoDB Dev Environ`);
      const mongooseConn = await connectToMongoDB(config);
      const dbModels = defineDBModels(mongooseConn);
      return { mongoDB: new MongoDB(mongooseConn, config, dbModels, log) };
    }

    if (isValidTestDB) {
      log.info(`MongoDB Testing Environ`);
      if (useUniqTestDB === undefined) {

        throw new Error(`Mongo test db init: must explicitly set useUniqTestDB: true/false`);
      }
      const dbSuffix = useUniqTestDB ? '-' + makeRndStr(3) : undefined;
      const mongooseConn = await connectToMongoDB(config, dbSuffix);
      const dbName = mongooseConn.name;
      log.debug(`mongo db ${dbName} connected...`);

      const timeOpt = isTestingEnv()? mockCurrentTimeOpt() : undefined;
      const dbModels = defineDBModels(mongooseConn, timeOpt);
      const mongoDB = new MongoDB(mongooseConn, config, dbModels, log);
      if (useUniqTestDB) {
        await mongoDB.createCollections();
      }

      return { mongoDB };
    }

    throw new Error(`Mongo db init: db name is not valid for dev,test,or prod environments`);
  },
  async function destroy({ mongoDB, isProductionDB, useUniqTestDB, retainTestDB }) {
    const MongoDBName = mongoDB.mongoose.name;

    if (isProductionDB) {
      putStrLn(`mongo closing db ${MongoDBName}...`);
      return mongoDB.mongoose.close();
    }

    const isTestDBName = /.+test.*/.test(MongoDBName);
    const isValidTestDB = isEnvMode('test') && isTestDBName;
    if (isValidTestDB && useUniqTestDB && !retainTestDB) {
      putStrLn(`mongo dropping db ${MongoDBName}...`);
      await mongoDB.mongoose.dropDatabase()
    }
    putStrLn(`mongo closing db ${MongoDBName}...`);
    await mongoDB.mongoose.close();
  }
)

export const mongooseExecScopeWithDeps = () => composeScopes(
  gracefulExitExecScope(),
  scopedMongoose()
);


export function mongoConfig(): MongoDBNeeds {
  const isProd = isProdEnv();
  const isTest = isTestingEnv();

  const config = loadConfig();
  const args = { config, isProductionDB: isProd, useUniqTestDB: isTest }
  return args;
}
