import { loadConfig } from '@watr/commonlib';
import path from 'path';

const appconfig = loadConfig();
const ConnectionURL = appconfig.get('mongodb:connectionUrl');
const MongoDBName = appconfig.get('mongodb:dbName');

const thisDir = path.dirname(__filename);
const migrationsDir = path.join(thisDir, 'migrations');
console.log(`loaded config... conn: ${ConnectionURL}, ${MongoDBName}`);
console.log(`  migrations = ${migrationsDir}`);

const config = {
  mongodb: {
    url: ConnectionURL,

    databaseName: MongoDBName,

    options: {
      useNewUrlParser: true, // removes a deprecation warning when connecting
      useUnifiedTopology: true, // removes a deprecating warning when connecting
      //   connectTimeoutMS: 3600000, // increase connection timeout to 1 hour
      //   socketTimeoutMS: 3600000, // increase socket timeout to 1 hour
    }
  },

  migrationsDir,

  // The mongodb collection where the applied changes are stored. Only edit this when really necessary.
  changelogCollectionName: 'changelog',

  // The file extension to create migrations and search for in migration dir
  migrationFileExtension: '.js',

  // Enable the algorithm to create a checksum of the file contents and use that in the comparison to determine
  // if the file should be run.  Requires that scripts are coded to be run multiple times.
  useFileHash: false,

  // Don't change this, unless you know what you're doing
  moduleSystem: 'commonjs',
};

module.exports = config;
