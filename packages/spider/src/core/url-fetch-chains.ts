import { prettyPrint, putStrLn } from '@watr/commonlib';
import _ from 'lodash';

import {
  HTTPRequest, HTTPResponse,
} from 'puppeteer';

export interface UrlChainLink {
  requestUrl: string;
  responseUrl?: string;
  status: string;
  method?: string;
  timestamp: string;
  contentType?: string;
}

export type UrlChain = UrlChainLink[];

export interface UrlFetchData extends UrlChainLink {
  responseUrl: string;
  fetchChain: UrlChain;
}

export function getUrlChainFromResponse(response: HTTPResponse): UrlChain {
  const request = response.request();
  const requestChain = getUrlChainFromRequest(request);
  const requestUrl = request.url();
  const responseUrl = response.url();
  const status = response.status().toString();
  const method = request.method();
  const responseHeaders = response.headers();
  const { date } = responseHeaders;
  prettyPrint({ responseHeaders })
  const contentType = responseHeaders['content-type'];

  const chainLink: UrlChainLink = {
    requestUrl,
    responseUrl,
    method,
    status,
    timestamp: date,
    contentType
  };

  return _.concat(requestChain, [chainLink]);
}

function getUrlChainFromRequest(request: HTTPRequest): UrlChain {
  const reqRedirectChain: HTTPRequest[] = request.redirectChain();
  const urlChain = _.flatMap(reqRedirectChain, req => {
    const requestUrl = req.url();
    const method = req.method();
    const resp = req.response();


    if (resp === null) {
      putStrLn('getUrlChainFromRequest() resp is null');
      return [];
    }

    const responseHeaders = resp.headers();
    const status = resp.status().toString();

    const { location, date } = responseHeaders;

    const chainLink: UrlChainLink = {
      requestUrl,
      responseUrl: location,
      method,
      status,
      timestamp: date
    };
    return [chainLink];
  });
  return urlChain;
}
