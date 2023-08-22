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

import { ConfigProvider, getServiceLogger, loadConfig, setLogEnvLevel } from '@watr/commonlib';
import { createBrowserPool } from '~/core/browser-pool';
import { useTestingHttpServer } from '~/dev/http-dev-server';
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

  function makeUrl(config: ConfigProvider, path: string): URL {
    const baseUrl = config.get('openreview:restApi')
    return new URL(`${baseUrl}${path}`);
  }


  it('should scrape a simple url', async () => {
    const config = loadConfig();
    const url = makeUrl(config, '/echo');

    for await (const __ of useTestingHttpServer({ config, workingDir })) {
      await withSpideringEnv(url, async (env) => {
        const pipeline = pipe(
          initArg(url, env),
          fetchUrl(),
          through((response) => {
            expect(response.response.ok()).toBe(true);
          })
        );

        await pipeline();
      });
    }

  });


  it('should block javascript by default', async () => {
    const config = loadConfig();
    const url = makeUrl(config, '/echo?foo=bar');

    for await (const __ of useTestingHttpServer({ config, workingDir })) {
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
    const config = loadConfig();
    const url = makeUrl(config, '/echo?foo=bar');

    for await (const __ of useTestingHttpServer({ config, workingDir })) {
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
