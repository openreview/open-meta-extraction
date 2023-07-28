import { Pool } from 'tarn';
import { getServiceLogger } from '@watr/commonlib';
import { BrowserInstance } from './browser-instance';
import { launchBrowser } from './puppet';
import EventEmitter from 'events';
import { PoolOptions } from 'tarn/dist/Pool';

export class PoolX<T> extends Pool<T> {
  constructor(opts: PoolOptions<T>) {
    super(opts);
  }

  getEmitter(): EventEmitter {
    const emitter: EventEmitter = (this as any).emitter;
    return emitter;
  }

  once(eventName: 'release', handler: (resource: BrowserInstance) => void): void {
    const emitter = this.getEmitter();
    emitter.on(eventName, function outerHandler(resource) {
      handler(resource);
      emitter.removeListener('release', outerHandler);
    });
  }
}

export function createUnderlyingPool(): PoolX<BrowserInstance> {
  const log = getServiceLogger(`PoolImpl<Browser>`);
  const pool = new PoolX<BrowserInstance>({
    log: (s: string) => log.info(s),
    async create(): Promise<BrowserInstance> {
      return launchBrowser().then(browser => {
        const browserInstance = new BrowserInstance(browser);
        browserInstance.installEventHandlers();
        return browserInstance;
      }).catch(error => {
        log.error(error);
        throw error;
      });
    },
    async destroy(browserInstance: BrowserInstance): Promise<void> {
      await browserInstance.close();
    },

    validate(browserInstance: BrowserInstance): boolean {
      log.debug(`validating Browser#${browserInstance.pid()}`);
      return !browserInstance.isStale();
    },

    max: 5, // maximum size of the pool
    min: 1, // minimum size of the pool


    // acquireTimeoutMillis?: number;
    // createTimeoutMillis?: number;
    // destroyTimeoutMillis?: number;
    // idleTimeoutMillis?: number;
    // createRetryIntervalMillis?: number;
    // reapIntervalMillis?: number;
    // propagateCreateError?: boolean;
  });


  pool.on('acquireRequest', eventId => {
    log.verbose(`pool/event: acquireRequest:${eventId}`);
  });
  pool.on('acquireSuccess', (eventId, resource) => {
    log.verbose(`pool/event: acquireSuccess:${eventId}: ${resource.asString()}`);
  });

  pool.on('acquireFail', (eventId, err) => {
    log.warn(`pool/event: acquireFail:${eventId}: ${err}`);
  });

  // resource returned to pool
  pool.on('release', resource => {
    log.verbose(`pool/event: release ${resource.asString()}`);
  });

  // resource was created and added to the pool
  pool.on('createRequest', eventId => {
    log.verbose(`pool/event: createRequest:${eventId}`);
  });
  pool.on('createSuccess', (eventId, resource) => {
    log.verbose(`pool/event: createSuccess:${eventId}: ${resource.asString()}`);
  });
  pool.on('createFail', (eventId, err) => {
    log.warn(`pool/event: createFail:${eventId} ${err}`);
  });

  // resource is destroyed and evicted from pool
  // resource may or may not be invalid when destroySuccess / destroyFail is called
  pool.on('destroyRequest', (eventId, resource) => {
    log.verbose(`pool/event: destroyRequest:${eventId}: ${resource.asString()}`);
  });
  pool.on('destroySuccess', (eventId, resource) => {
    log.verbose(`pool/event: destroySuccess:${eventId}: ${resource.asString()}`);
  });
  pool.on('destroyFail', (eventId, resource, err) => {
    log.warn(`pool/event: destroyFail:${eventId}: ${resource.asString()} ${err}`);
  });

  // when internal reaping event clock is activated / deactivated
  pool.on('startReaping', () => {
    log.verbose('pool/event: startReaping');
  });
  pool.on('stopReaping', () => {
    log.verbose('pool/event: stopReaping');
  });

  // pool is destroyed (after poolDestroySuccess all event handlers are also cleared)
  pool.on('poolDestroyRequest', eventId => {
    log.verbose(`pool/event: poolDestroyRequest:${eventId}`);
  });

  pool.on('poolDestroySuccess', eventId => {
    log.verbose(`pool/event: poolDestroySuccess:${eventId}`);
  });

  return pool;
}
