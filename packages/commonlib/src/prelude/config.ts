import path from 'path';
import _ from 'lodash';
import { Provider } from 'nconf';
import fs from 'fs';

export type ConfigProvider = Provider;

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

export function loadConfig(): Provider  {
  const provider = new Provider();

  const envMode = getEnv('NODE_ENV');
  if (!isValidEnvMode(envMode)) {
    throw new Error("NODE_ENV not set!");
  }

  const envFile = `config-${envMode}.json`;

  provider.argv().env();

  const envPath = findAncestorFile('.', envFile, ['conf', '.']);
  if (envPath === undefined) {
    throw new Error(`Could not find config file '${envFile}'`);
  }

  provider.file('env-conf', { file: envPath });
  return provider;
}

type EnvKey = keyof typeof Env;

export function getEnvMode(): string {
  const env = getEnv('NODE_ENV');
  return `${env}`;
}

export function isEnvMode(s: ENV_MODE):boolean {
  return getEnv('NODE_ENV') === s;
}
export function isTestingEnv(): boolean {
  return isEnvMode('test');
}

export function isDevEnv(): boolean {
  return isEnvMode('dev');
}

export function isProdEnv(): boolean {
  return isEnvMode('prod');
}

function getEnv(key: EnvKey): string | undefined {
  return process.env[key];
}

// TODO get rid of everything below this
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
