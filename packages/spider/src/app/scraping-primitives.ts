/**
 * Basic web scraping functions to control the browser
 **/

import _ from 'lodash';
import path from 'path';

import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';

import {
  Transform,
  FilterTransform,
  compose,
  through,
  tap,
  Explanation,
  filter,
  SpiderEnv
} from '~/core/taskflow-defs';

import {
  BrowserPool,
} from '~/core/browser-pool';

import {
  HTTPResponse
} from 'puppeteer';

import { blockedResourceReport } from '~/core/resource-blocking';
import {
  gotoUrlWithRewrites,
  writeHttpResponseBody,
  writeHttpResponseFrames,
} from './scraper';

import { UrlFetchData } from '~/core/url-fetch-chains';
import { Logger } from 'winston';
import { cleanArtifactDir, makeHashEncodedPath, purgeArtifactDirs, taskflow } from '@watr/commonlib';
import { DefaultPageInstanceOptions, GotoUrlResponse, PageInstance, PageInstanceOptions } from '~/core/browser-instance';

// Initialize SpiderEnv
export async function createSpiderEnv(
  log: Logger,
  browserPool: BrowserPool,
  corpusRoot: string,
  url: URL
): Promise<SpiderEnv> {
  const initialUrl = url.toString();
  const browserInstance = await browserPool.acquire();
  const entryEncPath = makeHashEncodedPath(initialUrl);

  const entryPath = () => path.resolve(corpusRoot, entryEncPath.toPath());
  const baseEnv = taskflow.initBaseEnv(log);

  const env: SpiderEnv = {
    ...baseEnv,
    initialUrl,
    entryPath,
    entryEncPath,
    browserPool,
    browserPageCache: {},
    browserInstance,
    getCachedPageInstance(): PageInstance | undefined {
      return _.get(this.browserPageCache, [initialUrl])
    }
  };

  return env;
}

// Allow URLs that match the given regex
export const urlFilter: (urlTest: RegExp) => FilterTransform<unknown> =
  (regex) => compose(
    through((_a, env) => env.initialUrl),
    filter((a: string) => regex.test(a), `url ~= m/${regex.source}/`),
  );

// Allow URLs that match any of the given regexes
export const urlFilterAny: (urlTests: RegExp[]) => FilterTransform<unknown> =
  (urlTests) => {
    const runTests = (url: string) => urlTests.some(regex => regex.test(url));
    return compose(
      through((_a, env) => env.initialUrl),
      filter((a: string) => runTests(a), 'urlFilterAny'),
    );
  }

// Fetch an HTTPResponse for the given URL
export const fetchUrl: (pageOpts?: PageInstanceOptions) => Transform<URL, GotoUrlResponse> =
  (pageOpts = DefaultPageInstanceOptions) => through((url, env) => {
    const { browserInstance, log, browserPageCache, initialUrl } = env;

    const scrapingTask: TE.TaskEither<string, GotoUrlResponse> = async () => {
      log.debug(`FetchUrl(): newPage`);
      const pageInstance = await browserInstance.newPage(pageOpts);
      browserPageCache[initialUrl] = pageInstance;
      blockedResourceReport(pageInstance, log);
      log.debug(`FetchUrl(): blockedResources`)
      return await gotoUrlWithRewrites(pageInstance, url.toString(), log);
    };

    return pipe(
      scrapingTask,
      TE.mapLeft((message) => {
        const ci: Explanation = [message];
        return ci;
      })
    );
  });


export const httpResponseToUrlFetchData: Transform<GotoUrlResponse, UrlFetchData> =
  through((gotoUrlResponse, env) => {

    const fetchChain = gotoUrlResponse.requestChain;
    const head =  fetchChain[0];
    const last =  fetchChain[fetchChain.length-1];
    const requestUrl = env.initialUrl
    if (head.requestUrl !== requestUrl) {
      env.log.error(`Fetch chain head !== specified request URL`);
    }
    const fetchData: UrlFetchData = {
      fetchChain,
      requestUrl: head.requestUrl,
      responseUrl: last.responseUrl || '',
      contentType: last.contentType,
      status: last.status,
      timestamp:''
    }
    return fetchData;
  });


// Return HTTPResponse as an HTML string
export const getHttpResponseBody: Transform<HTTPResponse, string> =
  through((httpResponse) => {
    return pipe(
      () => httpResponse.buffer().then(body => E.right(body.toString()))
    );
  });

export const writeResponseBody: Transform<GotoUrlResponse, GotoUrlResponse> =
  tap(({ response }, env) => {
    const entryPath = env.entryPath();
    return writeHttpResponseBody(response, entryPath);
  }, 'Writing Response Body');

export const writePageFrames: <A>() => Transform<A, A> =
  () => tap((_a, env) => {
    const { browserPageCache, initialUrl, entryPath } = env;
    const page = browserPageCache[initialUrl];
    return writeHttpResponseFrames(entryPath(), page)
  }, 'Writing Page Frames');

export const cleanArtifacts: <A>() => Transform<A, A> =
  () => tap((_a, env) => {
    const entryPath = env.entryPath();
    env.log.debug(`Cleaning artifact directory ${entryPath}`);
    cleanArtifactDir(entryPath);
  }, 'Clean Artifacts');

export const purgeArtifacts: <A>() => Transform<A, A> =
  () => tap((_a, env) => {
    const entryPath = env.entryPath();
    env.log.debug(`Purging artifact directory ${entryPath}`);
    purgeArtifactDirs(entryPath);
  }, 'Purge Artifacts');
