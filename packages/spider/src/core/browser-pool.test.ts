import _ from 'lodash';

import {
  asyncEachSeries,
  getServiceLogger,
  prettyPrint,
  putStrLn,
  setLogEnvLevel
} from '@watr/commonlib';

import {
  createBrowserPool,
  withBrowserInstance,
  withBrowserPool,
  WithPageInstance,
  withPageInstance
} from './browser-pool';

import { Pool } from 'tarn';
import { BrowserInstance, DefaultPageInstanceOptions } from './browser-instance';

describe('browser pooling', () => {
  setLogEnvLevel('trace');

  const log = getServiceLogger('pool')

  it('generators properly yield/close, own or share components', async () => {
    try {

      for await (const l1Components of withBrowserPool()) {
        expect(_.keys(l1Components)).toStrictEqual(['browserPool']);

        for await (const l2Components of withBrowserInstance(l1Components.browserPool)) {
          expect(_.keys(l2Components)).toStrictEqual(['browserPool', 'browserInstance']);
          expect(l2Components.browserPool).toBe(l1Components.browserPool)

          for await (const l3Components of withPageInstance(l2Components)) {
            expect(_.keys(l3Components)).toStrictEqual(['browserPool', 'browserInstance', 'page']);
            expect(l3Components.browserPool).toBe(l1Components.browserPool)
            expect(l3Components.browserInstance).toBe(l2Components.browserInstance)
          }

          for await (const comps of withPageInstance()) {
            expect(_.keys(comps)).toStrictEqual(['browserPool', 'browserInstance', 'page']);
            expect(comps.browserPool).not.toBe(l1Components.browserPool)
            expect(comps.browserPool).not.toBe(l2Components.browserPool)
          }
        }
      }

    } catch (error: any) {
      putStrLn(error['actual']);
      putStrLn(error['expected']);
      putStrLn(error['message']);
    }
  });

  it('borrow/return to pool', async () => {
    const browserPool = createBrowserPool();

    const browserInstance = await browserPool.acquire();
    const { page } = await browserInstance.newPage(DefaultPageInstanceOptions);

    await page.close();

    await browserPool.release(browserInstance);

    await browserPool.shutdown();
  });

  it.only('should properly shutdown/cleanup on errors', async () => {
    let poolNum = 0;
    let failPtNum = -1;

    const setupPools = new Set<Pool<BrowserInstance>>();
    function setupComponentHandlers({ browserPool }: Partial<WithPageInstance>) {
      if (browserPool) {
        const pool = browserPool.pool;
        if (setupPools.has(pool)) {
          putStrLn('Pool already setup');
          return;
        }

        setupPools.add(pool);
        const pnum = poolNum;
        pool.on('poolDestroyRequest', () => {
          putStrLn(`Pool#${pnum} Destroyed (request)`);
        });
        pool.on('poolDestroySuccess', () => {
          putStrLn(`Pool#${pnum} Destroyed (sucess)`);
        });
        poolNum++;
      }
    }

    async function attempt(failAtPosition: number) {
      putStrLn(`Attempt w/fail at ${failAtPosition}`);
      failPtNum = -1;
      poolNum = 0;
      function failPoint(comps: Partial<WithPageInstance>) {
        failPtNum++;
        setupComponentHandlers(comps);
        if (failPtNum === failAtPosition) {
          putStrLn(`Failing at p ${failPtNum}`);
          throw new Error(`Pos ${failPtNum} failure`);
        }
        putStrLn(`Passed p ${failPtNum}`);
      }
      try {

        for await (const l1Components of withBrowserPool()) {

          failPoint(l1Components);

          for await (const l2Components of withBrowserInstance(l1Components.browserPool)) {

            failPoint(l2Components);

            for await (const l3Components of withPageInstance(l2Components)) {
              failPoint(l3Components);
            }
            failPoint({});

            for await (const comps of withPageInstance()) {
              failPoint(comps);
            }
            failPoint({});
          }
          failPoint({});
        }
        failPoint({});
      } catch (error: any) {
        putStrLn(error.message);
        // putStrLn(error['actual']);
        // putStrLn(error['expected']);
        // putStrLn(error['message']);
        // fail(error);
      } finally {
        // if (n < failAtPosition) {
        // warn...
        // }
      }
    }

    await asyncEachSeries(_.range(10), (i) => attempt(i));
  });

  ///// Debug urls to simulate events in chrome, call as chrome://url
  const debugUrls = [
    'not-valid-url',
    'badcastcrash',
    'crash',
    'crashdump',
    'hang',
    'kill',
    'memory-exhaust',
    'shorthang',

    ///// Not valid debug urls in puppeteer's chrome (but should be according to documentation)
    // 'gpuclean',
    // 'gpucrash',
    // 'gpuhang',
    // 'inducebrowsercrashforrealz',
    // 'memory-pressure-critical',
    // 'memory-pressure-moderate',
    // 'ppapiflashcrash',
    // 'ppapiflashhang',
    // 'quit',
    // 'restart',
    // 'webuijserror',
  ];

  it.skip('force kill on hang/timeout', async () => {
    const browserPool = createBrowserPool();

    const attemptOne = async (url: string) => {
      log.debug(`attempting ${url}`);
      const browser = await browserPool.acquire();
      log.debug('acquired browser');
      const pageInstance = await browser.newPage(DefaultPageInstanceOptions);
      log.debug('acquired page');
      const { page } = pageInstance;
      log.debug('navigating...');
      const httpResponseP = page.goto(`chrome://${url}`, { timeout: 2000 });

      const resp = httpResponseP.then(async () => {
        log.debug(`finished page.goto( ${url} )`);
      }).catch(error => {
        log.debug(`httpResponse: ${error}`);
      });

      log.debug('await resp');
      await resp;
      log.debug('await release');
      await browserPool.release(browser);
      log.debug('/done attempt');
    };

    await asyncEachSeries(debugUrls, async (dbgUrl) => {
      log.debug(`1. Trying chrome://${dbgUrl}`);
      await attemptOne(dbgUrl);
      log.debug(`2. Trying chrome://${dbgUrl}`);
      await attemptOne(dbgUrl);
    });

    await browserPool.shutdown();
  });

  it.skip('close all remaining browserInstances on pool.shutdown()', async () => {
    const browserPool = createBrowserPool();
    log.debug('Acquiring browserInstances without releasing...');
    await browserPool.acquire();
    await browserPool.acquire();
    const bi = await browserPool.acquire();
    log.debug('Navigating to page');
    const bp = await bi.newPage(DefaultPageInstanceOptions);
    const httpResponse = await bp.gotoUrl('chrome://shorthang');
    browserPool.report();
    log.debug('Pool Shutdown');
    await browserPool.shutdown();
  });


});
