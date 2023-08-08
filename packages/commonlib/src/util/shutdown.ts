import { Logger } from 'winston';
import _ from 'lodash';

import { onExit, Handler } from 'signal-exit';
import { prettyPrint, putStrLn } from './pretty-print';
import { getServiceLogger } from './basic-logging';
import { asyncEachOfSeries } from './async-plus';
import { withScopedResource } from './scoped-usage';

export type ExitHandler = (code: Parameters<Handler>[0], signal: Parameters<Handler>[1]) => void | Promise<void>;

export const withGracefulExit = withScopedResource<
  GracefulExit,
  'gracefulExit'
>(
  'gracefulExit',
  async function init({}) {
    const gracefulExit = new GracefulExit();

    onExit((code, signal) => {
      gracefulExit.runHandlers(code, signal);
    });
    return { gracefulExit };
  },
  async function destroy() {
  },
)



export class GracefulExit {
  log: Logger;
  handlers: ExitHandler[];

  constructor() {
    this.log = getServiceLogger('GracefulExit')
    this.handlers = [];
  }
  addHandler(h: ExitHandler) {
    this.handlers.push(h);
  }

  async runHandlers(code: Parameters<Handler>[0], signal: Parameters<Handler>[1]) {
    this.log.info('Gracefully Exiting');
    await asyncEachOfSeries(this.handlers.reverse(), async (handler, i) => {
      await Promise.resolve(handler(code, signal)).catch(error => {
        prettyPrint({ error })
      });
    })
  }

  async awaitClose() {
    return new Promise<void>((resolve) => {
      putStrLn('awaitClose');
      process.on('disconnect', () => {
        putStrLn('resolve closed');
        resolve();
      });
    });
  }
}
