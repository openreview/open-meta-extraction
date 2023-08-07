import { asyncEachOfSeries, getServiceLogger, putStrLn } from '@watr/commonlib';
import { Logger } from 'winston';
import _ from 'lodash';

import { onExit, Handler } from 'signal-exit';

export type ExitHandler = (code: Parameters<Handler>[0], signal: Parameters<Handler>[1]) => void | Promise<void>;

export type WithGracefulExit = {
  gracefulExit: GracefulExit;
};

export async function* useGracefulExit(): AsyncGenerator<WithGracefulExit, void, any> {
  const gracefulExit = new GracefulExit();

    // const exitCB = _.bind(gracefulExit.runHandlers, gracefulExit);
  onExit((code, signal) => {
    gracefulExit.runHandlers(code, signal);

  });

  putStrLn('Before GE')
  yield { gracefulExit };
  putStrLn('After GE: pre close')
  // await gracefulExit.awaitClose();
  // putStrLn('After GE: post close')

}

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
    putStrLn('Gracefully Exiting');
    this.log.info('Gracefully Exiting');
    await asyncEachOfSeries(this.handlers, async (handler, i) => {
      await Promise.resolve(handler(code, signal))

    })
    this.log.debug('/Graceful Exit');
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
