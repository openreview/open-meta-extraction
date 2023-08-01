import parseUrl from 'url-parse';

import {
  compose,
  eachOrElse,
  tap,
} from '~/predef/extraction-prelude';

import {
  addEvidences,
  clearEvidence,
  validateEvidence,
} from '~/core/extraction-primitives';

import {
  gatherSchemaEvidence
} from './headtag-scripts';

const addUrlEvidence = addEvidences((a, env) => {
  const parsedUrl = parseUrl(env.urlFetchData.responseUrl);
  const { host } = parsedUrl;
  const paths = parsedUrl.pathname.split('/');
  const [, p1, p2] = paths.slice(0, -1);
  return [
    `url:host:${host}`,
    `url:path1:${p1}`,
    `url:path2:${p2}`,
  ];
});

// Try some general rules that often work, not specific to any particular URL
export const GeneralExtractionAttempts = compose(
  addUrlEvidence,
  gatherSchemaEvidence,
  tap((__, { log }) => log.debug('clearEvidence')),
  clearEvidence(/^url:/),
  tap((__, { log }) => log.debug('validateEvidence')),
  eachOrElse(
    validateEvidence({
      'title': 'title',
      'description|abstract': 'abstract',
      'author|creator?': 'author',
      'pdf?': 'pdf-link',
    }),
  )
);
