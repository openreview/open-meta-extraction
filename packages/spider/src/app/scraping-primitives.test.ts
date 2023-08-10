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

import { getServiceLogger, newIdGenerator, setLogEnvLevel } from '@watr/commonlib';
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
  const idGen =  newIdGenerator(1);
  const basePort = 9000;
  // const nextPortNum

  const workingDir = './test.scratch.d';

  function nextPortNum(): number {
    return basePort + idGen();
  }

  function makeUrl(path:string, port: number): URL {
    return new URL(`http://localhost:${port}${path}`);
  }


  it('should scrape a simple url', async () => {
    const port = nextPortNum();
    const url = makeUrl('/echo', port);

    for await (const __ of useTestingHttpServer({ port, workingDir })) {
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
    const port = nextPortNum();
    const url = makeUrl('/echo?foo=bar', port);

    for await (const __ of useTestingHttpServer({ port, workingDir })) {
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
    const port = nextPortNum();
    const url = makeUrl('/echo?foo=bar', port);

    for await (const __ of useTestingHttpServer({ port, workingDir })) {
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
