/*
 * Runtime Environment and execution patterns for scraper
 */

import _ from 'lodash';

import { Logger } from 'winston';

import {
  taskflow as ft,
  HashEncodedPath,
} from '@watr/commonlib';

import { BrowserPool } from './browser-pool';
import { BrowserInstance, PageInstance } from './browser-instance';

export interface NamespacedLogging {
  log: Logger;
  ns: string[];
  enterNS(ns: string[]): void;
  exitNS(ns: string[]): void;
};

export interface BrowserPoolCachingEnv {
  browserPool: BrowserPool;
  browserPageCache: Record<string, PageInstance>;
  browserInstance: BrowserInstance;
};

export interface SpiderEnv extends NamespacedLogging, BrowserPoolCachingEnv {
  initialUrl: string;
  entryEncPath: HashEncodedPath;
  entryPath(): string;
  getCachedPageInstance(): PageInstance|undefined;
};

const fp = ft.createTaskFlow<SpiderEnv>();

export const {
  tap,
  tapLeft,
  tapEitherEnv,
  through,
  log,
  filter,
  Transform,
  forEachDo,
  eachOrElse,
  takeWhileSuccess,
  collectFanout,
  valueEnvPair,
  initArg,
  controlEnvPair,
} = fp;

export const spiderTaskflow = fp;

type EnvT = SpiderEnv;

export type ExtractionTask<A> = ft.ExtractionTask<A, EnvT>;
export type ClientFunc<A, B> = ft.ClientFunc<A, B, EnvT>;
export type ClientResult<A> = ft.ClientResult<A>;
export type Transform<A, B> = ft.Transform<A, B, EnvT>;
export type FilterTransform<A> = ft.FilterTransform<A, EnvT>;

export type ExtractionRule = (ra: ExtractionTask<unknown>) => ExtractionTask<unknown>;

export const compose = ft.compose;
export const ClientFunc = fp.ClientFunc;

export type ControlInstruction = ft.ControlInstruction
