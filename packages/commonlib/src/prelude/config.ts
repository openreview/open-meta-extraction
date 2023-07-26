import path from 'path';
import _ from 'lodash';
import { makeHashEncodedPath, HashEncodedPath } from '~/util/hash-encoded-paths';
import nconf from 'nconf';
import fs from 'fs';
import { putStrLn } from '..';

export const ENV_MODES = {
  'dev': null,
  'test': null,
  'prod': null,
};

export type ENV_MODES = typeof ENV_MODES;
export type ENV_MODE = keyof ENV_MODES;

function isValidEnvMode(s: string | undefined): s is ENV_MODE {
  return s !== undefined && s in ENV_MODES;
}

export const Env = {
  NODE_ENV: null, // dev|prod|test
  AppSharePath: null,
  DBName: null,
  DBUser: null,
  DBPassword: null,
};

function isFile(p: string | undefined): boolean {
  return p!==undefined && fs.existsSync(p) && fs.statSync(p).isFile();
}
function isDir(p: string | undefined): boolean {
  return p!==undefined && fs.existsSync(p) && fs.statSync(p).isDirectory();
}

export function findAncestorFile(
  startingDir: string,
  filename: string,
  leadingDirs: string[]
): string | undefined {
  let currDir = path.resolve(startingDir);

  if (!isDir(currDir)) {
    return;
  }

  while (currDir != '/') {
    const parentDir = path.normalize(path.join(currDir, '..'));
    const maybeFiles = _.flatMap(leadingDirs, ld => {
      const maybeFile = path.join(currDir, ld, filename);
      if (isFile(maybeFile)) {
        return [maybeFile];
      }
      return [];
    });
    if (maybeFiles.length > 0) {
      return maybeFiles[0];
    }
    currDir = parentDir;
  }
}

export function initConfig(): typeof nconf {
  const envMode = getEnv('NODE_ENV');
  if (!isValidEnvMode(envMode)) {
    throw new Error("NODE_ENV not set!");
  }

  const envFile = `config-${envMode}.json`;

  nconf.argv().env();

  const envPath = findAncestorFile('.', envFile, ['conf', '.']);
  if (envPath === undefined) {
    throw new Error(`Could not find config file '${envFile}'`);
  }

  nconf.file('env-conf', { file: envPath });

  return nconf;
}

type EnvKey = keyof typeof Env;

export function getEnvMode(): string {
  const env = getEnv('NODE_ENV');
  return `${env}`;
}
export function isTestingEnv(): boolean {
  return getEnv('NODE_ENV') === 'test';
}

export function isDevEnv(): boolean {
  return getEnv('NODE_ENV') === 'dev';
}

function getEnv(key: EnvKey): string | undefined {
  return process.env[key];
}

// Root directory for storing application data
export function getAppSharedDir(): string {
  return 'app-share.d';
}

// The root directory in which the spider will download files
export function getCorpusRootDir(): string {
  const shareDir = getAppSharedDir();
  const corpusRoot = path.join(shareDir, 'corpus-root.d');
  return path.resolve(corpusRoot);
}

export function getHashEncodedPath(url: string): HashEncodedPath {
  return makeHashEncodedPath(url, 3);
}

// TODO get rid of this, as it uses global corpus root defs
export function getCorpusEntryDirForUrl(url: string): string {
  const corpusRoot = getCorpusRootDir();
  const entryEncPath = getHashEncodedPath(url);
  const entryPath = path.resolve(corpusRoot, entryEncPath.toPath());
  return entryPath;
}
