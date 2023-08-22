import * as E from 'fp-ts/Either';

import _ from 'lodash';

import {
  HTTPResponse,
  PuppeteerLifeCycleEvent,
  BrowserEmittedEvents,
} from 'puppeteer';

import { getServiceLogger, putStrLn } from '@watr/commonlib';

import {
  Browser, Page,
} from 'puppeteer';

import { BlockableResource, RewritableUrl, RewritableUrls } from './resource-blocking';
import { Logger } from 'winston';
import { UrlChainLink, getUrlChainFromResponse } from './url-fetch-chains';

export type GotoUrlResponse = {
  response: HTTPResponse;
  requestChain: UrlChainLink[];
}

function browserStringId(browser: Browser): string {
  const proc = browser.process();
  const pid = proc ? proc.pid : '?pid?';
  return `Browser#${pid}`;
}

export class BrowserInstance {
  browser: Browser;
  logPrefix: string;
  createdAt: Date;
  log: Logger;
  isClosed: boolean = false;

  constructor(b: Browser) {
    this.browser = b;
    this.logPrefix = browserStringId(b);
    this.createdAt = new Date();
    this.log = getServiceLogger(browserStringId(b))
  }

  installEventHandlers(): void {
    // logBrowserEvent(this, this.log);
  }

  pid(): number {
    const proc = this.browser.process();
    if (proc === null) return -1;
    const pid = proc.pid;
    return pid === undefined ? -1 : pid;
  }

  async newPage(opts: PageInstanceOptions): Promise<PageInstance> {
    const page = await this.browser.newPage();
    page.setDefaultNavigationTimeout(opts.defaultNavigationTimeout);
    page.setDefaultTimeout(opts.defaultTimeout);
    page.setJavaScriptEnabled(opts.javaScriptEnabled);
    await page.setRequestInterception(opts.requestInterception);
    const pageInstance = new PageInstance(page, opts);
    pageInstance.initRequestInterception();
    // interceptRequestCycle(pageInstance, this.log);
    // interceptPageEvents(pageInstance, this.log);
    return pageInstance;
  }

  isStale(): boolean {
    return this.isClosed;
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    return this.browser.close()
      .then(() => {
        this.log.debug(`${this.asString()} closed`);
      })
      .catch((error) => {
        this.log.error(`${this.asString()} close error: ${error}`);
      });
  }

  async kill(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    const bproc = this.browser.process();
    if (bproc === null) return;

    const pid = bproc.pid;
    if (pid === undefined) return;

    return new Promise(resolve => {
      bproc.removeAllListeners();

      bproc.on('exit', (_signum: number, signame: NodeJS.Signals) => {
        this.log.debug(`Killed Browser#${pid}: ${signame}`);
        // this.events.push('exit');
        resolve();
      });

      try {
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        this.log.debug(`process.kill() error: ${error}`);
        // this.events.push('exit');
        resolve();
      }
    });
  }

  asString(): string {
    return this.logPrefix;
  }
}



/*
 * Log all events when log level = Verbose
 */
export function logBrowserEvent(browserInstance: BrowserInstance, logger: Logger) {
  putStrLn('begin logBrowserEvent')
  // prettyPrint({ browserInstance, logger })
  const { browser } = browserInstance;
  putStrLn('next logBrowserEvent')

  const events = [
    BrowserEmittedEvents.TargetChanged,
    BrowserEmittedEvents.TargetCreated,
    BrowserEmittedEvents.TargetDestroyed,
    BrowserEmittedEvents.Disconnected,
  ];
  putStrLn('logBrowserEvent0')

  const bproc = browser.process();
  const pid = bproc?.pid;
  putStrLn('logBrowserEvent1')
  if (bproc === null || pid === undefined) {
    logger.error('logBrowserEvents(): browser.process().pid is undefined');
    return;
  }
  putStrLn('logBrowserEvent3')

  _.each(events, (event) => {
    putStrLn(`logBrowserEvent4 ${event}`)
    browser.on(event, (e) => {
      const ttype = e?._targetInfo?.type;
      const turl = e?._targetInfo?.url;
      logger.verbose(`Browser#${pid}: browserEvent: ${event}, targetType: ${ttype}, targetUrl: ${turl}`);
    });
  });
}

export class PageInstance {
  page: Page;
  logPrefix: string;
  createdAt: Date;
  opts: PageInstanceOptions;
  log: Logger;

  constructor(
    page: Page,
    opts: PageInstanceOptions
  ) {
    this.page = page;
    this.createdAt = new Date();
    this.opts = opts;
    this.logPrefix = '';
    this.log = getServiceLogger('Page');
  }

  initRequestInterception() {
    // Optionally abort a request before it is made, if that request is for
    // a blocked resource type, or if the requested URL will be rewritten
    // and the request re-sent

    const bproc = this.page.browser().process();
    const pid = bproc?.pid;
    if (bproc === null || pid === undefined) {
      return;
    }

    // request.abort(e: ErrorCode)
    //   declare type ErrorCode =
    //     'aborted' | 'accessdenied' | 'addressunreachable' | 'blockedbyclient'
    //   | 'blockedbyresponse' | 'connectionaborted' | 'connectionclosed'
    //   | 'connectionfailed' | 'connectionrefused' | 'connectionreset'
    //   | 'internetdisconnected' | 'namenotresolved' | 'timedout' | 'failed';
    this.page.on('request', async (request) => {
      if (request.isInterceptResolutionHandled()) return;
      const url = request.url();
      const resType = request.resourceType();
      const allowedResources = this.opts.allowedResources;
      if (!allowedResources.includes(resType)) {
        putStrLn(`Blocking request for resource ${url}`);
        request.abort('aborted' /* = ErrorCode*/);
        return;
      }

      const isRewritable = this.opts.rewriteableUrls.some(({ regex }) => {
        return regex.test(url);
      });

      if (isRewritable) {
        this.log.debug(`Aborting rewritable url ${url}`);
        request.abort('blockedbyclient');
        return;
      }


      // TODO options arg may be used here to implement the rewritable url system
      await request.continue(
        request.continueRequestOverrides(),
        0
      );
    });
  }

  async gotoUrl(url: string): Promise<E.Either<string, GotoUrlResponse>> {
    const page = this.page;
    const waitUntil = this.opts.waitUntil;

    return await page.goto(url, { waitUntil })
      .then(response => {
        if (response === null) {
          return E.left(`null HTTPResponse to ${url}`);
        }
        const requestChain = getUrlChainFromResponse(response);
        return E.right({ response, requestChain });
      })
      .catch((error: Error) => {
        return E.left(`${error.name}: ${error.message}`);
      })
      ;
  }
}

export interface PageInstanceOptions {
  cacheEnabled: boolean;
  defaultNavigationTimeout: number;
  defaultTimeout: number;
  javaScriptEnabled: boolean;
  allowedResources: BlockableResource[];
  rewriteableUrls: RewritableUrl[];
  waitUntil: PuppeteerLifeCycleEvent;
  requestInterception: boolean;
}

export const DefaultPageInstanceOptions: PageInstanceOptions = {
  cacheEnabled: false,
  defaultNavigationTimeout: 10_000,
  defaultTimeout: 10_000,
  javaScriptEnabled: false,
  allowedResources: ['document'],
  rewriteableUrls: RewritableUrls,
  waitUntil: 'domcontentloaded',
  requestInterception: true,

};

export const ScriptablePageInstanceOptions: PageInstanceOptions = {
  cacheEnabled: false,
  defaultNavigationTimeout: 10_000,
  defaultTimeout: 10_000,
  javaScriptEnabled: true,
  allowedResources: ['document', 'script'],
  rewriteableUrls: RewritableUrls,
  waitUntil: 'networkidle0',
  requestInterception: true,
};
