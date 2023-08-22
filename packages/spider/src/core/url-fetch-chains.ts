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
}

export type UrlChain = UrlChainLink[];

export interface UrlFetchData extends UrlChainLink {
  responseUrl: string;
  fetchChain: UrlChain;
}

function getUrlChainFromRequest0(request: HTTPRequest): UrlChain {
  const reqRedirectChain: HTTPRequest[] = request.redirectChain();
  const urlChain = _.flatMap(reqRedirectChain, req => {
    const requestUrl = req.url();
    const resp = req.response();

    if (resp === null) {
      return [];
    }

    const responseChainHeaders = resp.headers();
    const status = resp.status().toString();

    const { location, date } = responseChainHeaders;

    const chainLink: UrlChainLink = {
      requestUrl,
      responseUrl: location,
      status,
      timestamp: date
    };
    return [chainLink];
  });
  return urlChain;
}

function getUrlChainFromRequest(request: HTTPRequest): UrlChain {
  const reqRedirectChain: HTTPRequest[] = request.redirectChain();
  const urlChain = _.flatMap(reqRedirectChain, req => {
    const requestUrl = req.url();
    const method = req.method();
    const requestHeaders = req.headers();
    const resp = req.response();


    if (resp === null) {
      putStrLn('getUrlChainFromRequest() resp is null');
      return [];
    }

    const responseHeaders = resp.headers();
    const status = resp.status().toString();

    const statusText = resp.statusText();
    const { location, date } = responseHeaders;
    prettyPrint({ requestUrl, method, location, status, statusText, responseHeaders, requestHeaders })

    const chainLink: UrlChainLink = {
      requestUrl,
      responseUrl: location,
      status,
      timestamp: date
    };
    return [chainLink];
  });
  return urlChain;
}


export function getFetchDataFromResponse(requestUrl: string, response: HTTPResponse): UrlFetchData {
  const request: HTTPRequest = response.request();
  const fetchChain = getUrlChainFromRequest(request);

  const responseUrl = response.url();
  const status = response.status().toString();
  const statusText = response.statusText();
  const { date } = response.headers();
  prettyPrint({ requestUrl, responseUrl, status, statusText })

  const fetchData: UrlFetchData = {
    requestUrl,
    responseUrl,
    status,
    fetchChain,
    timestamp: date,
  };
  return fetchData;
}
