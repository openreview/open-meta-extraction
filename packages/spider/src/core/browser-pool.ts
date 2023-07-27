import _ from 'lodash';

import { Pool } from 'tarn';
import { Logger } from 'winston';

import { asyncEach, getServiceLogger, prettyPrint, putStrLn } from '@watr/commonlib';
import { createUnderlyingPool } from './browser-pool-impl';
import { BrowserInstance, DefaultPageInstanceOptions, PageInstance } from './browser-instance';
import EventEmitter from 'events';

export function createBrowserPool(): BrowserPool {
  const pool = createUnderlyingPool();
  const browserPool = new BrowserPool(pool);
  return browserPool;
}


export type WithBrowserPool = {
  browserPool: BrowserPool
};

export async function* withBrowserPool(): AsyncGenerator<WithBrowserPool, void, any> {
  const browserPool = createBrowserPool();
  const pool = browserPool.pool;
  try {
    yield { browserPool };
  } finally {
    const destroyP = new Promise((resolve) => {
      pool.on('poolDestroyRequest', () => {
        putStrLn(`Pool Destroyed (request)`);
      });
      pool.on('poolDestroySuccess', () => {
        putStrLn(`Pool Destroyed (sucess)`);
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
  for await (const { browserPool } of withBrowserPool()) {
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
  pool: Pool<BrowserInstance>;
  log: Logger;
  cachedResources: Record<string, BrowserInstance>;
  releaseQueue: Promise<void>

  constructor(pool: Pool<BrowserInstance>) {
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

    function makeReleaser(targetId: string) {
      function releaser(resource: BrowserInstance): boolean {
        const releasedId = resource.asString();
        self.log.verbose(`Pool/ReleaseEvent: checking ${releasedId}  =?= ${targetId}`);
        if (targetId === releasedId) {
          self.log.verbose(`Pool/ReleaseEvent: matched ${resource.asString()}`);
          return true;
        }
        return false;
      };
      return releaser;
    }

    self.log.verbose('Await Enter Release Queue')
    await this.releaseQueue;
    self.log.verbose('Entered Release Queue')

    const releaseP = new Promise<void>((resolve) => {
      const targetId = browserInstance.asString();
      const releaseFunc = makeReleaser(targetId);
      // icky hack to expose internal EventEmitter, need more complete
      // access than pool implementation provides
      const emitter: EventEmitter = (this.pool as any).emitter;
      emitter.on('release', function handler(resource) {
        if(releaseFunc(resource)) {
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

  // TODO obsolete func
  async use<A>(f: (browser: BrowserInstance) => A | Promise<A>): Promise<A> {
    const acq = this.pool.acquire();
    const browser = await acq.promise;
    const a = await Promise
      .resolve(f(browser))
      .finally(() => {
        this.pool.release(browser);
      });

    return a;

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
