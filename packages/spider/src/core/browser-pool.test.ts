import { asyncEachSeries, getServiceLogger, setLogEnvLevel  } from '@watr/commonlib';
import { BrowserInstance, createBrowserPool, DefaultPageInstanceOptions } from './browser-pool';

describe('browser pooling', () => {
  setLogEnvLevel('info');

  const log = getServiceLogger('pool')

  it('borrow/return to pool', async () => {
    const browserPool = createBrowserPool();

    const browserInstance = await browserPool.acquire();
    const { page } = await browserInstance.newPage(DefaultPageInstanceOptions);

    await page.close();

    await browserPool.release(browserInstance);

    await browserPool.shutdown();
  });

  it('shutdown on error', async () => {
    log.debug('pos.0');
    const browserPool = createBrowserPool();

    log.debug('pos.1');

    await browserPool.use(async (_browserInstance: BrowserInstance) => {
      log.debug('pos.2');
      throw new Error('problem');
    }).catch((_err) => {
      log.debug('pos.4');
      log.debug('but we are okay now...');
    });

    const browser = await browserPool.acquire();
    await browserPool.release(browser);

    await browserPool.shutdown();

    log.debug('pos.7');
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
