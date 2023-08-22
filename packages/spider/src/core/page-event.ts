/**
 * Register handlers for all browser/page events
 * Initialize event logging and create interception hooks
 */

import _ from 'lodash';

import {
  HTTPResponse,
  HTTPRequest,
  PageEventObject,
  ConsoleMessage,
  Metrics,
  WebWorker,
  Dialog,
} from 'puppeteer';

import { Logger } from 'winston';

import { currentlyBlockedResources } from './resource-blocking';
import { PageInstance } from './browser-instance';
import { putStrLn } from '@watr/commonlib';

const PageEvents: Array<keyof PageEventObject> = [
  'close',
  'console',
  'dialog',
  'domcontentloaded',
  'error',
  'frameattached',
  'framedetached',
  'framenavigated',
  'load',
  'metrics',
  'pageerror',
  'popup',
  // 'request',
  // 'requestfailed',
  // 'requestfinished',
  // 'response',
  'workercreated',
  'workerdestroyed',
];

const RequestCycleEvents: Array<keyof PageEventObject> = [
  'request',
  'requestfailed',
  'requestfinished',
  'response'
];



function _updateMap<K, V>(
  m: Map<K, V>,
  k: K,
  upfn: (v: V) => V,
  defaultVal: V
): V {
  const oldval = m.get(k);
  if (oldval) {
    const newval = upfn(oldval);
    m.set(k, newval);
    return newval;
  }
  m.set(k, defaultVal);
  return defaultVal;
}

function interceptRequestCycleEvents(pageInstance: PageInstance, logger: Logger) {
  const { page } = pageInstance;

  const bproc = page.browser().process();
  const pid = bproc?.pid;
  if (bproc === null || pid === undefined) {
    logger.error('interceptPageEvents(): browser.process().pid is undefined');
    return;
  }


  const eventMap = new Map<string, string[]>();
  const msgMap = new Map<string, string[]>();

  const reqRespCycleSucceed = new Set<string>([
    'request',
    'response',
    'requestfinished',
  ]);
  const reqRespCycleFail = new Set([
    'request',
    'requestfailed',
  ]);

  function setsEqual(a: Set<any>, b: Set<any>): boolean {
    return a.size === b.size && [...a].every(value => b.has(value));
  }

  function updateEventMap(reqId: string, e: string, msg?: string) {
    const currVal = _updateMap(eventMap, reqId, (evs) => _.concat(evs, [e]), [e]);
    if (msg) {
      _updateMap(msgMap, reqId, (m) => _.concat(m, [msg]), [msg]);
    }

    const currSet = new Set(currVal);
    if (setsEqual(currSet, reqRespCycleFail)) {
      const currMsg = msgMap.get(reqId) || [];
      const isBlocked = currMsg.some(m => /blocked/.test(m));
      if (isBlocked) {
        logger.debug(`B<${pid}> / Fail<${reqId}> ${currMsg.join(', ')} `);
      } else {
        logger.debug(`B<${pid}> / Fail<${reqId}> ${currMsg.join(', ')} `);
      }
      eventMap.delete(reqId);
      msgMap.delete(reqId);
    }

    if (setsEqual(currSet, reqRespCycleSucceed)) {
      const currMsg = msgMap.get(reqId) || [];
      logger.debug(`B<${pid}> / Success<${reqId}> ${currMsg.join(', ')} `);
      eventMap.delete(reqId);
      msgMap.delete(reqId);
    }
  }

  _.each(RequestCycleEvents, e => {
    page.on(e, (_data: any) => {
      switch (e) {
        case 'request': {
          const data: HTTPRequest = _data;
          const resType = data.resourceType();
          // prettyPrint({ msg: 'request intercept', request: data })
          // NB: _requestId was taken out of typescript type defs, but still
          // exists in js def This use of internal data should be changed in the
          // future to preserve compatibility with puppeteer
          const reqId: string = (data as any)._requestId;
          const url = data.url();
          const currBlocked = currentlyBlockedResources(pageInstance);
          const clippedUrl = url.replace(/\?.*$/, '?...');
          let msg = `resource: ${resType} ${clippedUrl}`;
          const isBlocked = currBlocked.some(b => b === resType);
          if (isBlocked) {
            msg = `blocked: ${resType}`;
          }
          updateEventMap(reqId, e, msg);
          break;
        }
        case 'requestfailed': {
          const data: HTTPRequest = _data;
          // NB: _requestId was taken out of typescript type defs, but still
          // exists in js def This use of internal data should be changed in the
          // future to preserve compatibility with puppeteer
          const reqId: string = (data as any)._requestId;
          updateEventMap(reqId, e, e);
          break;
        }
        case 'requestfinished': {
          const data: HTTPRequest = _data;
          // NB: _requestId was taken out of typescript type defs, but still
          // exists in js def This use of internal data should be changed in the
          // future to preserve compatibility with puppeteer
          const reqId: string = (data as any)._requestId;
          updateEventMap(reqId, e, e);
          break;
        }
        case 'response': {
          const data: HTTPResponse = _data;
          const request = data.request();
          // prettyPrint({ msg: 'response intercept', request, response: data })
          const url = request.url();
          const resType = request.resourceType();
          // NB: _requestId was taken out of typescript type defs, but still
          // exists in js def This use of internal data should be changed in the
          // future to preserve compatibility with puppeteer
          const reqId: string = (request as any)._requestId;
          if (resType === 'document') {
            logger.debug(`Response: document (request id: ${reqId}) resource url ${url}`)
          }
          updateEventMap(reqId, e, e);
          break;
        }
      }
    })
  });
}

export function interceptPageEvents(pageInstance: PageInstance, logger: Logger) {
  const { page } = pageInstance;

  const bproc = page.browser().process();
  const pid = bproc?.pid;
  if (bproc === null || pid === undefined) {
    logger.error('interceptPageEvents(): browser.process().pid is undefined');
    return;
  }

  interceptRequestCycleEvents(pageInstance, logger);

  _.each(PageEvents, e => {
    page.on(e, (_data: any) => {
      switch (e) {
        case 'domcontentloaded':
        case 'load':
        case 'close': {
          logger.verbose(`Browser#${pid}/pageEvent: ${e}`);
          break;
        }
        case 'console': {
          const data: ConsoleMessage = _data;
          const text = data.text();
          logger.verbose(`Browser#${pid}/pageEvent: ${e}: ${text}`);
          break;
        }
        case 'dialog': {
          const data: Dialog = _data;
          const message = data.message();
          logger.verbose(`Browser#${pid}/pageEvent: ${e}: ${message}`);
          break;
        }
        case 'pageerror':
        case 'error': {
          const data: Error = _data;
          const { message } = data;
          const { name } = data;
          logger.warn(`Browser#${pid}/pageEvent: ${e}: ${name} / ${message}`);
          break;
        }
        case 'frameattached':
        case 'framedetached':
        case 'framenavigated': {
          // const data: Frame = _data;
          logger.verbose(`Browser#${pid}/pageEvent: ${e}`);
          break;
        }
        case 'metrics': {
          const data: { title: string, metrics: Metrics } = _data;
          logger.verbose(`Browser#${pid}/pageEvent: ${e}: ${data.title} / ${data.metrics}`);
          break;
        }
        case 'popup': {
          logger.warn(`Browser#${pid}/pageEvent: ${e}`);
          break;
        }

        case 'workercreated':
        case 'workerdestroyed': {
          const data: WebWorker = _data;
          const url = data.url();
          logger.verbose(`Browser#${pid}/pageEvent: ${e}: ${url}`);
          break;
        }
        default:
          logger.warn(`Browser#${pid}/Unknown event: ${e}`);
      }
    });
  });
}


