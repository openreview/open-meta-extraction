import _ from 'lodash';

import { pipe } from 'fp-ts/function';

import {
  createSpiderEnv,
  fetchUrl
} from './scraping-primitives';

import {
  SpiderEnv,
  through,
  initArg,
} from '~/core/taskflow-defs';

import { getServiceLogger, setLogEnvLevel } from '@watr/commonlib';
import { createBrowserPool } from '~/core/browser-pool';
import { useTestingHttpServer } from '~/dev/test-http-server';
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

  it('should scrape a simple url', async () => {
    const url = new URL('http://localhost:9100/echo');

    for await (const __ of useTestingHttpServer(workingDir)) {
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
    }

  });


  it('should block javascript by default', async () => {
    const url = new URL('http://localhost:9100/echo?foo=bar');

    for await (const __ of useTestingHttpServer(workingDir)) {
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
    }
  });

  it('should allow javascript when specified', async () => {
    const url = new URL('http://localhost:9100/echo?foo=bar');

    for await (const __ of useTestingHttpServer(workingDir)) {
      await withSpideringEnv(url, async (env) => {
        const pipeline = pipe(
          initArg(url, env),
          fetchUrl(ScriptablePageInstanceOptions),
          through((_response, env) => {
            const pageInstance = env.getCachedPageInstance();
            expect(pageInstance).toBeDefined();
            expect(pageInstance!.page.isJavaScriptEnabled()).toBe(true);
          })
        );

        await pipeline();
      });
    }
  });
});
