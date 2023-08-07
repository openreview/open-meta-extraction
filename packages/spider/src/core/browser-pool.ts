import _ from 'lodash';

import { Logger } from 'winston';

import { asyncEach, getServiceLogger, prettyPrint } from '@watr/commonlib';
import { PoolX, createUnderlyingPool } from './browser-pool-impl';
import { BrowserInstance, DefaultPageInstanceOptions, PageInstance } from './browser-instance';

export function createBrowserPool(): BrowserPool {
  const pool = createUnderlyingPool();
  const browserPool = new BrowserPool(pool);
  return browserPool;
}

export type WithBrowserPool = {
  browserPool: BrowserPool
};

export async function* useBrowserPool(): AsyncGenerator<WithBrowserPool, void, any> {
  const browserPool = createBrowserPool();
  const pool = browserPool.pool;
  // register ending hooks here:
  try {
    yield { browserPool };
  } finally {
    const destroyP = new Promise((resolve) => {
      pool.on('poolDestroyRequest', () => {
        // putStrLn(`Pool Destroyed (request)`);
      });
      pool.on('poolDestroySuccess', () => {
        // putStrLn(`Pool Destroyed (sucess)`);
        resolve(undefined);
      });

    });
    const shutdownP = browserPool.shutdown();
    await Promise.all([shutdownP, destroyP]);
  }
}

export type WithBrowserInstance = WithBrowserPool & {
  browserInstance: BrowserInstance;
}

export async function* withBrowserInstance(
  providedBrowserPool?: BrowserPool
): AsyncGenerator<WithBrowserInstance, void, any> {
  let browserInstance: BrowserInstance | undefined;
  if (providedBrowserPool) {
    try {
      browserInstance = await providedBrowserPool.acquire();
      yield { browserPool: providedBrowserPool, browserInstance };
    } finally {
      if (browserInstance) {
        await providedBrowserPool.release(browserInstance);
      }
    }
    return;
  }
  for await (const { browserPool } of useBrowserPool()) {
    try {
      browserInstance = await browserPool.acquire();
      yield { browserPool, browserInstance };
    } finally {
      if (browserInstance) {
        await browserPool.release(browserInstance);
      }
    }
  }
}
export type WithPageInstance = WithBrowserInstance & {
  page: PageInstance;
}

export async function* withPageInstance(
  provided?: WithBrowserPool | WithBrowserInstance | undefined
): AsyncGenerator<WithPageInstance, void, any> {
  if (!provided) {
    for await (const { browserPool, browserInstance } of withBrowserInstance()) {
      let pageInstance: PageInstance | undefined;
      try {
        pageInstance = await browserInstance.newPage(DefaultPageInstanceOptions);
        yield { browserPool, browserInstance, page: pageInstance }
      } finally {
        if (pageInstance) {
          await pageInstance.page.close();
        }
      }
    }
    return;
  }

  if ('browserInstance' in provided) {
    const { browserInstance, browserPool } = provided;
    let pageInstance: PageInstance | undefined;
    try {
      pageInstance = await browserInstance.newPage(DefaultPageInstanceOptions);
      yield { browserPool, browserInstance, page: pageInstance }
    } finally {
      if (pageInstance) {
        await pageInstance.page.close();
      }
    }
    return;
  }

  // only browserPool is provided
  const { browserPool } = provided;
  for await (const { browserInstance } of withBrowserInstance(browserPool)) {
    let pageInstance: PageInstance | undefined;
    try {
      pageInstance = await browserInstance.newPage(DefaultPageInstanceOptions);
      yield { browserPool, browserInstance, page: pageInstance }
    } finally {
      if (pageInstance) {
        await pageInstance.page.close();
      }
    }
  }

}


export class BrowserPool {
  pool: PoolX<BrowserInstance>;
  log: Logger;
  cachedResources: Record<string, BrowserInstance>;
  releaseQueue: Promise<void>

  constructor(pool: PoolX<BrowserInstance>) {
    this.pool = pool;
    this.log = getServiceLogger('BrowserPool')
    this.cachedResources = {};
    this.releaseQueue = Promise.resolve();
  }

  async acquire(): Promise<BrowserInstance> {
    const acq = this.pool.acquire();
    const b: BrowserInstance = await acq.promise;
    const pid = b.pid().toString()
    this.cachedResources[pid] = b;
    return b;
  }

  async release(browserInstance: BrowserInstance): Promise<void> {
    const self = this;
    const pid = browserInstance.pid().toString()
    if (!(pid in this.cachedResources)) {
      return;
    }
    delete this.cachedResources[pid];
    this.log.debug(`Releasing ${browserInstance.asString()}`);

    function resourceIdMatches(targetId: string) {
      function isMatch(resource: BrowserInstance): boolean {
        const releasedId = resource.asString();
        self.log.verbose(`Pool/ReleaseEvent: checking ${releasedId}  =?= ${targetId}`);
        if (targetId === releasedId) {
          self.log.verbose(`Pool/ReleaseEvent: matched ${resource.asString()}`);
          return true;
        }
        return false;
      };
      return isMatch;
    }

    self.log.verbose('Await Enter Release Queue')
    await this.releaseQueue;
    self.log.verbose('Entered Release Queue')

    const releaseP = new Promise<void>((resolve) => {
      const targetId = browserInstance.asString();
      const isMatch = resourceIdMatches(targetId);
      const emitter = this.pool.getEmitter();
      this.pool.on('release', function handler(resource) {
        if (isMatch(resource)) {
          self.log.verbose('removing release listener')
          emitter.removeListener('release', handler);
          resolve();
        }
      });
    });

    this.releaseQueue = this.releaseQueue.then(() => releaseP)
    await browserInstance.close();
    this.pool.release(browserInstance);
    self.log.verbose('Exit Release Queue')
    this.log.debug(`Done Releasing ${browserInstance.asString()}`);
  }

  async shutdown(): Promise<void> {
    this.log.debug('Begin Shutdown');
    const cachedInstances: Array<[string, BrowserInstance]> = _.toPairs(this.cachedResources);
    const cachedBrowsers = _.map(cachedInstances, ([, v]) => v);
    await asyncEach(cachedBrowsers, b => this.release(b));
    return this.pool.destroy().then(() => {
      this.log.debug('Done Shutdown');
    });
  }

  report(): void {
    const numFree = this.pool.numFree();
    const numPendingAcquires = this.pool.numPendingAcquires();
    const numPendingCreates = this.pool.numPendingCreates();
    const numPendingValidations = this.pool.numPendingValidations();
    const numUsed = this.pool.numUsed();
    const cachedInstances: Array<[string, BrowserInstance]> = _.toPairs(this.cachedResources);
    const cachedPIDs = _.map(cachedInstances, ([k]) => k);
    const cachedInstanceIds = cachedPIDs.join('; ');

    prettyPrint({
      numUsed,
      numFree,
      numPendingAcquires,
      numPendingCreates,
      numPendingValidations,
      cachedInstanceIds
    });

  }
  async clearCache(): Promise<void> {
    this.log.debug('Clear Cache (disabled)');
  }
}
