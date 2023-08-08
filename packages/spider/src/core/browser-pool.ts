import _ from 'lodash';

import { Logger } from 'winston';

import { GracefulExit, asyncEach, getServiceLogger, prettyPrint, withScopedResource } from '@watr/commonlib';
import { PoolX, createUnderlyingPool } from './browser-pool-impl';
import { BrowserInstance, DefaultPageInstanceOptions, PageInstance } from './browser-instance';
type BrowserPoolNeeds = {
  gracefulExit: GracefulExit;
};

export const scopedBrowserPool = withScopedResource<
  BrowserPool,
  'browserPool',
  BrowserPoolNeeds
>(
  'browserPool',
  async function init({ gracefulExit }) {
    const pool = createUnderlyingPool();
    const browserPool = new BrowserPool(pool);
    gracefulExit.addHandler(async () => {
      await browserPool.shutdown();
    });
    return { browserPool };
  },
  async function destroy() {
  },
);

export type BrowserInstanceNeeds = {
  browserPool: BrowserPool
};

export const scopedBrowserInstance = withScopedResource<
  BrowserInstance,
  'browserInstance',
  BrowserInstanceNeeds
>(
  'browserInstance',
  async function init({ browserPool }) {
    const browserInstance = await browserPool.acquire();
    return { browserInstance };
  },
  async function destroy({ browserInstance, browserPool }) {
    await browserPool.release(browserInstance);
  },
);

type PageInstanceNeeds = {
  browserInstance: BrowserInstance
};

export const scopedPageInstance = withScopedResource<
  PageInstance,
  'pageInstance',
  PageInstanceNeeds
>(
  'pageInstance',
  async function init({ browserInstance }) {
    const pageInstance = await browserInstance.newPage(DefaultPageInstanceOptions);
    return { pageInstance };
  },
  async function destroy({ pageInstance }) {
    await pageInstance.page.close();
  },
);



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


export function createBrowserPool(): BrowserPool {
  const pool = createUnderlyingPool();
  const browserPool = new BrowserPool(pool);
  return browserPool;
}

// export type UseBrowserPoolArgs = Partial<WithGracefulExit> & {
//   browserPool?: BrowserPool
// }

// export type WithBrowserPool = WithGracefulExit & {
//   browserPool: BrowserPool
// };


// export async function* useBrowserPool(args: UseBrowserPoolArgs): AsyncGenerator<WithBrowserPool, void, any> {
//   for await (const ge of useGracefulExit(args)) {
//     let browserPool = args.browserPool;
//     const isLocal = args.browserPool === undefined;
//     if (!browserPool) {
//       const bp = browserPool = createBrowserPool();
//       ge.gracefulExit.addHandler(async () => {
//         await bp.shutdown();
//       });
//     }
//     yield _.merge({ browserPool }, ge);
//   }
// }

// export type UseBrowserInstance = Partial<WithBrowserPool> & {
//   browserInstance?: BrowserInstance;
// };

// export type WithBrowserInstance = WithBrowserPool & {
//   browserInstance: BrowserInstance;
// }

// export async function* useBrowserInstance(
//   args: UseBrowserInstance
// ): AsyncGenerator<WithBrowserInstance, void, any> {
//   for await (const bp of useBrowserPool(args)) {
//     const isLocal = args.browserInstance === undefined;
//     let browserInstance = args.browserInstance;
//     try {
//       if (!browserInstance) {
//         browserInstance = await bp.browserPool.acquire();
//       }
//       yield _.merge(bp, { browserInstance });
//     } finally {
//       if (isLocal && browserInstance) {
//         await bp.browserPool.release(browserInstance);
//       }
//     }
//   }
// }

// export type UsePageInstance = Partial<WithBrowserInstance> & {
//   page?: PageInstance;
// }
// export type WithPageInstance = WithBrowserInstance & {
//   page: PageInstance;
// }

// export async function* usePageInstance(
//   args: UsePageInstance
// ): AsyncGenerator<WithPageInstance, void, any> {
//   for await (const bi of useBrowserInstance(args)) {
//     const isLocal = args.page === undefined;
//     let page = args.page;
//     try {
//       if (!page) {
//         page = await bi.browserInstance.newPage(DefaultPageInstanceOptions);
//       }
//       yield _.merge({}, bi, { page });
//     } finally {
//       if (isLocal && page) {
//         await page.page.close();
//       }
//     }
//     return;
//   }
// }
