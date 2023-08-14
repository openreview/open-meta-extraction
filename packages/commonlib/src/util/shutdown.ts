import { Logger } from 'winston';
import _ from 'lodash';

import { onExit, Handler } from 'signal-exit';
import { prettyPrint, putStrLn } from './pretty-print';
import { getServiceLogger } from './basic-logging';
import { asyncEachOfSeries } from './async-plus';
import { withScopedExec } from './scoped-exec';

export type ExitHandler = (code: Parameters<Handler>[0], signal: Parameters<Handler>[1]) => void | Promise<void>;

export type GracefulExitNeeds = {};
export const gracefulExitExecScope = () => withScopedExec<
  GracefulExit,
  'gracefulExit',
  GracefulExitNeeds
>(
  async function init({}) {
    const gracefulExit = new GracefulExit();

    onExit((code, signal) => {
      gracefulExit.runHandlers(code, signal);
      return true;
    });
    return { gracefulExit };
  },
  async function destroy() {
  },
);

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
    const handlers = this.handlers.reverse();
    this.log.info(`Gracefully Exiting: ${handlers.length} exit handlers`);
    await asyncEachOfSeries(handlers, async (handler, i) => {
      putStrLn(`GracefulExit: running handler #${i}`)
      await Promise.resolve(handler(code, signal)).catch(error => {
        prettyPrint({ error })
      });
    })
  }
}
