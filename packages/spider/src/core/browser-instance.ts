import * as E from 'fp-ts/Either';

import _ from 'lodash';

import {
  HTTPResponse,
  PuppeteerLifeCycleEvent,
  BrowserEmittedEvents,
} from 'puppeteer';

import { getServiceLogger } from '@watr/commonlib';

import {
  Browser, Page,
} from 'puppeteer';
import { interceptRequestCycle, interceptPageEvents } from './page-event';

import { BlockableResource, RewritableUrl, RewritableUrls } from './resource-blocking';
import { Logger } from 'winston';

function browserStringId(browser: Browser): string {
  const proc = browser.process();
  const pid = proc? proc.pid :  '?pid?';
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
    this.logPrefix = browserStringId(b) ;
    this.createdAt = new Date();
    this.log = getServiceLogger(browserStringId(b))
  }

  installEventHandlers(): void {
    logBrowserEvent(this, this.log);
  }

  pid(): number {
    const proc = this.browser.process();
    if (proc === null) return -1;
    const pid = proc.pid;
    return pid === undefined ? -1 : pid;
  }

  async newPage(opts: PageInstanceOptions): Promise<PageInstance> {
    this.log.debug('newPage:begin');
    this.log.debug(`newPage:browser.isConnected()=${this.browser.isConnected()}`);

    const page = await this.browser.newPage();
    this.log.debug('newPage:acquired');
    page.setDefaultNavigationTimeout(opts.defaultNavigationTimeout);
    page.setDefaultTimeout(opts.defaultTimeout);
    page.setJavaScriptEnabled(opts.javaScriptEnabled);
    page.setRequestInterception(opts.requestInterception);
    this.log.debug('newPage:setProps');

    const pageInstance = new PageInstance(page, opts);
    interceptPageEvents(pageInstance, this.log);
    interceptRequestCycle(pageInstance, this.log);
    this.log.debug('newPage:done');
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
  const { browser } = browserInstance;

  const events = [
    BrowserEmittedEvents.TargetChanged,
    BrowserEmittedEvents.TargetCreated,
    BrowserEmittedEvents.TargetDestroyed,
    BrowserEmittedEvents.Disconnected,
  ];

  const bproc = browser.process();
  const pid = bproc?.pid;
  if (bproc === null || pid === undefined) {
    logger.error('logBrowserEvents(): browser.process().pid is undefined');
    return;
  }

  _.each(events, (event) => {
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

  constructor(page: Page, opts: PageInstanceOptions) {
    this.page = page;
    this.createdAt = new Date();
    this.opts = opts;
    this.logPrefix = '';
  }

  async gotoUrl(url: string): Promise<E.Either<string, HTTPResponse>> {
    return gotoUrlSimpleVersion(this, url);
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

// TODO move this func
async function gotoUrlSimpleVersion(pageInstance: PageInstance, url: string): Promise<E.Either<string, HTTPResponse>> {
  const { page, opts } = pageInstance;
  const { waitUntil } = opts;

  return page.goto(url, { waitUntil })
    .then(resp => {
      if (resp === null) {
        return E.left(`null HTTPResponse to ${url}`);
      }
      return E.right(resp);
    })
    .catch((error: Error) => {
      return E.left(`${error.name}: ${error.message}`);
    })
    ;
}
