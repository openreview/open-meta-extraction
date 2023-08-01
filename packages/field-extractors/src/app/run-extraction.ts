import _ from 'lodash';
import path from 'path';

import {
  ensureArtifactDirectories,
  readCorpusJsonFile,
  getServiceLogger,
  readTextOrUndef,
  putStrLn,
  isUrl,
  asyncEachSeries,
} from '@watr/commonlib';

import * as TE from 'fp-ts/TaskEither';

import { BrowserPool, createBrowserPool, createSpiderEnv, UrlFetchData } from '@watr/spider';

import {
  ExtractionEnv,
} from '~/predef/extraction-prelude';

import {
  SpiderAndExtractionTransform,
} from '~/core/extraction-rules';

import { CanonicalFieldRecords, FieldRecord } from '~/predef/extraction-records';
import { Logger } from 'winston';

export function readUrlFetchData(entryPath: string,): UrlFetchData | undefined {
  return readCorpusJsonFile<UrlFetchData>(entryPath, '.', 'metadata.json');
}

type RMEArgs = {
  corpusRoot: string,
  urlFile: string,
  clean: boolean,
};
export async function runMainExtractFromFile({
  corpusRoot, urlFile, clean
}: RMEArgs): Promise<void> {
  const textContent = readTextOrUndef(urlFile);
  if (textContent === undefined) {
    putStrLn(`No content found in ${urlFile}`)
    return;
  }

  const log = getServiceLogger('field-extractor');
  const browserPool = createBrowserPool();

  const urlLines = textContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => isUrl(l));

  putStrLn(`Processing ${urlLines.length} URLs`);

  await asyncEachSeries(urlLines, async (urlstr) => {
    putStrLn(`Extracting> ${urlstr}`);
    const url = new URL(urlstr);
    await spiderAndExtractFields(corpusRoot, url, browserPool, log);
  });

  await browserPool.shutdown();
}

type RMArgs = {
  corpusRoot: string,
  urlstr: string,
  clean: boolean,
};


export async function runMainSpiderAndExtractFields({
  corpusRoot, urlstr,
}: RMArgs): Promise<void> {
  const log = getServiceLogger('field-extractor');
  const browserPool = createBrowserPool();
  const url = new URL(urlstr);

  await spiderAndExtractFields(corpusRoot, url, browserPool, log)

  await browserPool.shutdown();
}

export async function spiderAndExtractFields(
  corpusRoot: string,
  url: URL,
  browserPool: BrowserPool,
  log: Logger
): Promise<void> {

  const spiderEnv = await createSpiderEnv(log, browserPool, corpusRoot, url);
  const { entryPath, } = spiderEnv;
  ensureArtifactDirectories(entryPath());

  await SpiderAndExtractionTransform(TE.right([url, spiderEnv]))();
  await browserPool.clearCache();
}

export function getEnvCanonicalFields(env: ExtractionEnv): CanonicalFieldRecords {
  const { fieldRecs } = env;

  const fieldRecords: FieldRecord[] = _.flatMap(_.toPairs(fieldRecs), ([fieldName, fieldInstances]) => {
    if (fieldName === 'author') {
      return fieldInstances;
    }
    const fi0 = fieldInstances.at(0);
    return fi0? [fi0] : [];
  });

  const canonicalRecords: CanonicalFieldRecords = {
    fields: fieldRecords
  };
  return canonicalRecords;
}
