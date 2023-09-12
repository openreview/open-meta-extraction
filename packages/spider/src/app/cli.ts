import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {
  arglib,
  getServiceLogger,
  setLogEnvLevel,
  putStrLn
} from '@watr/commonlib';

import { createBrowserPool } from '~/core/browser-pool';

import {
  SpiderEnv,
  compose,
  tap,
  Transform,
  tapLeft,
  succeedWith
} from '~/core/taskflow-defs';

import {
  cleanArtifacts,
  createSpiderEnv,
  httpResponseToUrlFetchData,
  fetchUrl,
  writeResponseBody,
  writePageFrames
} from './scraping-primitives';
import { GotoUrlResponse } from '..';

const {
  opt,
  config,
  registerCmd
} = arglib;

export function registerCommands(yargv: arglib.YArgsT) {
  registerCmd(
    yargv,
    'spider-url',
    'spider the give URL, save results in corpus',
    config(
      opt.existingDir('corpus-root: root directory for corpus files'),
      opt.str('url'),
      opt.flag('clean: remove downloaded artifacts from prior runs', false),
      opt.flag('write: write the html page(s) to disk', false),
      opt.logLevel('info'),
    )
  )(async (args: any) => {
    const { url, corpusRoot, clean, logLevel, write } = args;

    const log = getServiceLogger('spider')

    setLogEnvLevel(logLevel);

    const browserPool = createBrowserPool();

    const env: SpiderEnv = await createSpiderEnv(log, browserPool, corpusRoot, url);

    let spiderPipeline: Transform<URL, GotoUrlResponse> = compose(
      fetchUrl(),
    );

    if (clean) {
      spiderPipeline = compose(
        cleanArtifacts(),
        spiderPipeline,
      );
    }


    if (write) {
      spiderPipeline = compose(
        spiderPipeline,
        writeResponseBody,
        writePageFrames(),
      );
    }

    const pipeline = compose(
      spiderPipeline,
      httpResponseToUrlFetchData,
      tap((result) => {
        putStrLn('Success:', result)
      }),
      tapLeft((error) => {
        putStrLn('Error:', error)
      })
    );

    const arg = TE.right(succeedWith(url, env));
    const runnable = pipe(arg, pipeline)

    try {
      await runnable()
    } finally {
      await browserPool.release(env.browserInstance)
      await browserPool.shutdown()
    }
  });
}
