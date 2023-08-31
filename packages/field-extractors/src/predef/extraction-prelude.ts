import _ from 'lodash';

import { UrlFetchData, SpiderEnv } from '@watr/spider';

import { ExtractionEvidence, FieldCandidate, FieldRecord } from './extraction-records';

import { taskflow as ft } from '@watr/commonlib';

interface NormalForms {
  'css-norm': null;
  'original': null;
  'tidy-norm': null
}

export type NormalForm = keyof NormalForms;

export type CacheFileKey = string;

export interface ExtractionEnv extends SpiderEnv {
  urlFetchData: UrlFetchData;
  fieldRecs: Record<string, FieldRecord[]>;
  fields: FieldRecord[];
  evidence: ExtractionEvidence[];
  fieldCandidates: FieldCandidate[];
  fileContentCache: Record<string, any>;
};

const fp = ft.createTaskFlow<ExtractionEnv>();

export const {
  tap,
  tapLeft,
  tapEitherEnv,
  through,
  mapEnv,
  log,
  filter,
  ClientFunc,
  Transform,
  forEachDo,
  eachOrElse,
  takeWhileSuccess,
  collectFanout,
} = fp;

export type ControlInstruction = ft.ControlInstruction;

type EnvT = ExtractionEnv;


type ExtractionSuccess<A> = ft.TaskSuccess<A, EnvT>
type ExtractionFailure = ft.TaskFailure<EnvT>
export type ExtractionResult<A> = ft.TaskResult<A, EnvT>

export type ExtractionTask<A> = ft.ExtractionTask<A, EnvT>;
export type PerhapsW<A> = ft.PerhapsWithEnv<A, EnvT>;
export type ClientFunc<A, B> = ft.ClientFunc<A, B, EnvT>;
export type ClientResult<A> = ft.ClientResult<A>;
export type Transform<A, B> = ft.Transform<A, B, EnvT>;
export type FilterTransform<A> = ft.FilterTransform<A, EnvT>;

export type ExtractionRule = (ra: ExtractionTask<unknown>) => ExtractionTask<unknown>;

export type SpiderToExtractionEnvTransform<A> = ft.EnvTransform<A, SpiderEnv, ExtractionEnv>;

export const compose = ft.compose;
