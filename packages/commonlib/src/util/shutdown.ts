import { Logger } from 'winston';
import _ from 'lodash';

import { onExit, Handler } from 'signal-exit';
import { putStrLn } from './pretty-print';
import { getServiceLogger } from './basic-logging';
import { asyncEachOfSeries } from './async-plus';
import { makeScopedResource } from './scoped-usage';

export type ExitHandler = (code: Parameters<Handler>[0], signal: Parameters<Handler>[1]) => void | Promise<void>;

// export type WithGracefulExit = {
//   gracefulExit: GracefulExit;
// };

// export type UseGracefulExitArgs = {
//   gracefulExit?: GracefulExit;
// }
// export async function* useGracefulExit({
//   gracefulExit
// }: UseGracefulExitArgs): AsyncGenerator<WithGracefulExit, void, any> {
//   if (gracefulExit) {
//     yield { gracefulExit }
//     return;
//   }

//   const newGracefulExit = new GracefulExit();
//   let didOnExit = false;

//   onExit((code, signal) => {
//     didOnExit = true;
//     newGracefulExit.runHandlers(code, signal);
//   });

//   yield { gracefulExit: newGracefulExit };

//   if (didOnExit) return;

//   await newGracefulExit.runHandlers(0, null)

// }

type GracefulExitNeeds = {
};

export const scopedGracefulExit = makeScopedResource<
  GracefulExit,
  'gracefulExit',
  GracefulExitNeeds
>(
  'gracefulExit',
  async function init({}) {
    const gracefulExit = new GracefulExit();

    let didOnExit = false;

    onExit((code, signal) => {
      didOnExit = true;
      gracefulExit.runHandlers(code, signal);
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
    this.log.info('Gracefully Exiting');
    await asyncEachOfSeries(this.handlers, async (handler, i) => {
      await Promise.resolve(handler(code, signal));
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
