import _ from 'lodash';
import { Server } from 'http';

import { pipe } from 'fp-ts/function';

import {
  createSpiderEnv,
  getHttpResponseBody,
  httpResponseToUrlFetchData,
  fetchUrl
} from './scraping-primitives';

import {
  SpiderEnv,
  through,
  initArg,
} from '~/core/taskflow-defs';

import { getServiceLogger, putStrLn, setLogEnvLevel } from '@watr/commonlib';
import { createBrowserPool } from '~/core/browser-pool';
import { closeTestServer, resetTestServer } from '~/dev/test-http-server';
import { ScriptablePageInstanceOptions } from '~/core/browser-instance';

const corpusRoot = 'test.d';

async function withSpideringEnv(url: URL, fn: (env: SpiderEnv) => Promise<void>) {
  const log = getServiceLogger('primitives')
  const browserPool = createBrowserPool();
  const env: SpiderEnv = await createSpiderEnv(log, browserPool, corpusRoot, url);

  await fn(env);

  await browserPool.release(env.browserInstance)
  await browserPool.shutdown()
}

describe('scraping primitives', () => {
  setLogEnvLevel('info');

  const workingDir = './test.scratch.d';

  let testServer: Server | undefined;

  beforeAll(async () => {
    testServer = await resetTestServer(workingDir);
    putStrLn('test server started');
  });

  afterAll(async () => {
    return closeTestServer(testServer);
  });


  it('should scrape a simple url', async () => {
    const url = new URL('http://localhost:9100/echo');

    await withSpideringEnv(url, async (env) => {
      const pipeline = pipe(
        initArg(url, env),
        fetchUrl(),
        through((response) => {
          expect(response.ok()).toBe(true);
        })
      );

      await pipeline();
    });
  });


  it('should block javascript by default', async () => {
    const url = new URL('http://localhost:9100/echo?foo=bar');

    await withSpideringEnv(url, async (env) => {
      const pipeline = pipe(
        initArg(url, env),
        fetchUrl(),
        through((_resp, env) => {
          const pageInstance = env.getCachedPageInstance();
          expect(pageInstance).toBeDefined();
          expect(pageInstance!.page.isJavaScriptEnabled()).toBe(false);
        })
      );

      await pipeline();
    });
  });

  it('should allow javascript when specified', async () => {
    const url = new URL('http://localhost:9100/echo?foo=bar');

    await withSpideringEnv(url, async (env) => {
      const pipeline = pipe(
        initArg(url, env),
        fetchUrl(ScriptablePageInstanceOptions),
        through((response, env) => {
          const pageInstance = env.getCachedPageInstance();
          expect(pageInstance).toBeDefined();
          expect(pageInstance!.page.isJavaScriptEnabled()).toBe(true);
        })
      );

      await pipeline();
    });
  });

});
