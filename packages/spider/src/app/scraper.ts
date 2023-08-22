import _ from 'lodash';
import * as E from 'fp-ts/Either';

import {
  writeCorpusJsonFile,
  writeCorpusTextFile,
  asyncMapSeries,
  prettyPrint,
} from '@watr/commonlib';

import {
  Frame,
  HTTPResponse
} from 'puppeteer';

import {
  UrlFetchData
} from '~/core/url-fetch-chains';

import {
  GotoUrlResponse,
  PageInstance
} from '~/core/browser-instance';


import { Logger } from 'winston';

export async function gotoUrlWithRewrites(
  pageInstance: PageInstance,
  url: string,
  logger: Logger,
): Promise<E.Either<string, GotoUrlResponse>> {
  const urlRewrites = pageInstance.opts.rewriteableUrls;

  logger.debug(`gotoUrlWithRewrites(): initialGoto`)
  const response = await pageInstance.gotoUrl(url);
  logger.debug(`gotoUrlWithRewrites(): got response`);
  if (E.isLeft(response)) {
    const error = response.left;
    prettyPrint({ error });
    logger.debug(`Attempting Rewrite for ${error}`);
    logger.debug(` Rewrite url ${url}`);
    const msg = error;
    const maybeRewrite = _.map(urlRewrites, (rule) => {
      if (rule.regex.test(msg)) {
        const newUrl = rule.rewrite(msg);
        logger.verbose(`    new url: ${newUrl}`);
        return newUrl;
      }
    });
    const rw0 = maybeRewrite.filter(s => s !== undefined);
    logger.verbose(`    available rewrites: ${rw0.join(', ')}`);
    if (rw0.length > 0) {
      const rewrite = rw0[0];
      if (rewrite === undefined) return E.left('no rewrites available');
      logger.info(`Rewrote ${url} to ${rewrite}`);
      return gotoUrlWithRewrites(pageInstance, rewrite, logger);
    }
  }
  return response;
}


export async function writeHttpResponseBody(
  response: HTTPResponse,
  entryRootPath: string,
): Promise<void> {
  const respBuffer = await response.buffer();
  writeCorpusTextFile(entryRootPath, '.', 'response-body', respBuffer.toString());
}

export async function writeHttpHeaders(
  response: HTTPResponse,
  entryRootPath: string,
): Promise<void> {
  const request = response.request();
  const requestHeaders = request.headers();
  writeCorpusJsonFile(entryRootPath, '.', 'request-headers.json', requestHeaders);

  const respHeaders = response.headers();
  writeCorpusJsonFile(entryRootPath, '.', 'response-headers.json', respHeaders);
}

export async function writeHttpResponseFrames(
  entryRootPath: string,
  pageInstance: PageInstance,
): Promise<void> {
  const { page } = pageInstance;
  const frames = page.frames();
  const timeoutMS = 5000;

  const allFrameContent = await asyncMapSeries<Frame, string>(
    frames,
    async (frame: Frame): Promise<string> => {
      const content = await new Promise<string>((resolve) => {
        let counter = 0;
        const timeout = setTimeout(function () {
          counter += 1;
          resolve(`timeout after ${timeoutMS}ms`);
        }, timeoutMS);

        frame.content()
          .then(c => {
            if (counter === 0) {
              clearTimeout(timeout);
              resolve(c[0]);
            }
          }).catch(_err => {
            // Catches Target Closed errors if timeout occurs
            // console.log(`error getting frame.content(): ${err}`);
          });
      });

      return content;
    }
  );

  _.each(allFrameContent, (frameContent, i) => {
    if (frameContent.length > 0) {
      writeCorpusTextFile(entryRootPath, '.', `response-frame-${i}`, frameContent);
    }
  });

}

export async function writeRequestToDisk(
  response: HTTPResponse,
  entryRootPath: string,
  pageInstance: PageInstance,
  urlFetchData: UrlFetchData
): Promise<void> {
  await writeHttpHeaders(response, entryRootPath);
  await writeHttpResponseBody(response, entryRootPath);
  await writeHttpResponseFrames(entryRootPath, pageInstance);

  writeCorpusJsonFile(entryRootPath, '.', 'metadata.json', urlFetchData);
}
