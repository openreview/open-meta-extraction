import _ from 'lodash';
import xml2js from 'xml2js';

import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';

import path from 'path';

import {
  ArtifactSubdir,
  expandDir,
  readCorpusTextFile,
  writeCorpusTextFile,
  diffByChars,
  runTidyCmdBuffered,
  runFileCmd,
  toUrl,
  Change,
  prettyFormat,
} from '@watr/commonlib';

import {
  Transform,
  ExtractionEnv,
  ControlInstruction,
  NormalForm,
  forEachDo,
  FilterTransform,
  through,
  filter,
  tap,
  tapEitherEnv,
  ClientFunc,
  ClientResult,
  takeWhileSuccess,
  log,
  // ExtractionSharedEnv,
  CacheFileKey,
  compose
} from '~/predef/extraction-prelude';

import {
  ExtractionEvidence,
  FieldRecord,
  FieldCandidate
} from '~/predef/extraction-records';

import {
  BrowserPage,
  expandCaseVariations,
  getElemAttr,
  getElemText,
  loadBrowserPage,
  selectAll,
  selectElemAttr,
  selectOne
} from './html-query-primitives';

import {
  AbstractCleaningRules,
  CleaningRule,
  CleaningRuleResult
} from './data-cleaning';
import { joinLines, loadTextFile } from './text-primitives';
import { SpiderEnv, UrlFetchData } from '@watr/spider';
import { Logger } from 'winston';



// This means add a string representing the sort of evidence we are exploring
function _addEvidence(env: ExtractionEnv, evidence: string) {
  const e: ExtractionEvidence = {
    evidence,
  };

  env.evidence.push(e);
}

export const addEvidence: <A>(f: (a: A, env: ExtractionEnv) => string) => Transform<A, A> =
  (f) => tap((a, env) => _addEvidence(env, f(a, env)));

export const addEvidences: <A>(f: (a: A, env: ExtractionEnv) => string[]) => Transform<A, A> =
  (f) => tap((a, env) => f(a, env).forEach(ev => _addEvidence(env, ev)));

function removeEvidence(env: ExtractionEnv, regex: RegExp) {
  const filtered = _.filter(env.evidence, (er) => !regex.test(er.evidence));
  env.evidence.splice(0, env.evidence.length, ...filtered);
}

export const clearEvidence: (evidenceTest: RegExp) => Transform<unknown, unknown> = (evidenceTest: RegExp) => {
  return tapEitherEnv((env) => removeEvidence(env, evidenceTest));
};


export const saveEvidence: (evidenceName: string) => Transform<string, void> =
  (evidenceName) => through((extractedValue: string, env) => {
    const text = extractedValue.trim();
    const savedEvidenceStrings = _.map(env.evidence, ev => ev.evidence);
    const evidence = _.concat(savedEvidenceStrings, [evidenceName]);
    const candidate: FieldCandidate = {
      text,
      evidence,
    };
    env.fieldCandidates.push(candidate);
  }, `saveEvidence:${evidenceName}`);


function saveFieldRecs(env: ExtractionEnv): void {
  const grouped = _.groupBy(env.fields, (f) => f.name);
  _.each(
    _.toPairs(grouped),
    ([name, fields]) => {
      _.update(
        env.fieldRecs, name, (fieldRecs: FieldRecord[]) => {
          if (fieldRecs === undefined) {
            return [...fields];
          }
          return _.concat(fieldRecs, fields);
        }
      );
    }
  );
}

const listArtifactFiles: (artifactDir: ArtifactSubdir, regex: RegExp) => Transform<unknown, CacheFileKey[]> =
  (dir, regex) => through((_a, env) => {
    const { entryPath } = env;
    const artifactRoot = path.join(entryPath(), dir);
    const exDir = expandDir(artifactRoot);
    const matching = _.filter(exDir.files, f => regex.test(f));
    const keys: CacheFileKey[] = _.map(matching, f => path.join(dir, f));
    return keys;
  }, 'listArtifacts');


const listResponseBodies = listArtifactFiles('.', /response-body|response-frame/);

const tidyHtmlTask: (filename: string) => TE.TaskEither<string, string[]> = (filepath: string) => {
  const tidyOutputTask = () => runTidyCmdBuffered(filepath)
    .then(([stderr, stdout, _exitCode]) => {
      // Tidy  exit codes = 0: ok, 1: warnings, 2: errors
      const hasStdout = _.some(stdout, line => line.trim().length > 0);
      if (hasStdout) {
        return E.right<string, string[]>(stdout);
      }
      const errString = _.find(stderr, l => l.trim().length > 0);
      const err = errString !== undefined ? errString : 'unknown error';
      return E.left<string, string[]>(err);
    });
  return tidyOutputTask;
};


const listTidiedHtmls: Transform<unknown, CacheFileKey[]> = through((_z, env) => {
  const { fileContentCache } = env;
  const normType: NormalForm = 'tidy-norm';
  const cacheKeys = _.map(
    _.toPairs(fileContentCache), ([k]) => k
  );
  return _.filter(cacheKeys, k => k.endsWith(normType));
}, 'list(tidy)');


const loadXML: Transform<string, any> = through((artifactPath, env) => {
  const { fileContentCache, entryPath } = env;
  const normType: NormalForm = 'original';

  const cacheKey = `${artifactPath}.${normType}`;

  if (cacheKey in fileContentCache) {
    return ClientFunc.success(cacheKey);
  }

  // TODO this use of 'cache', vs '.' is unnecessary and confusing
  const maybeCachedContent = readCorpusTextFile(entryPath(), '.', artifactPath);

  if (maybeCachedContent) {
    return pipe(
      TE.right({}),
      TE.bind('parsed', ({}) => () => xml2js.parseStringPromise(maybeCachedContent).then(E.right)),
      TE.bind('cacheKey', ({ parsed }) => {
        fileContentCache[cacheKey] = parsed;
        return TE.right(cacheKey);
      }),
      TE.map(({ cacheKey }) => cacheKey)
    );
  }

  return ClientFunc.halt(`loadXML Fail for ${artifactPath}`);
}, 'loadXML');

const runHtmlTidy: Transform<string, string> = through((artifactPath, env) => {
  // TODO I don't think the cache key is working...
  const { fileContentCache, entryPath, log } = env;
  const normType: NormalForm = 'tidy-norm';
  const cacheKey = `${artifactPath}.${normType}`;
  if (cacheKey in fileContentCache) {
    log.debug(`HTMLTidy: Cache key:${cacheKey} hit`);
    return ClientFunc.success(cacheKey);
  }
  const maybeCachedContent = readCorpusTextFile(entryPath(), 'cache', cacheKey);
  if (maybeCachedContent) {
    fileContentCache[cacheKey] = maybeCachedContent;
    log.debug(`HTMLTidy: Cache key:${cacheKey} loaded file`);
    return ClientFunc.success(cacheKey);
  }
  const fullPath = path.resolve(entryPath(), artifactPath);

  const maybeTidy: ClientResult<string> = pipe(
    tidyHtmlTask(fullPath),
    TE.map((lines: string[]) => {
      const tidiedContent = lines.join('\n');
      writeCorpusTextFile(entryPath(), 'cache', cacheKey, tidiedContent);
      fileContentCache[cacheKey] = tidiedContent;

      log.debug(`HTMLTidy: Cache key:${cacheKey} ran`);
      return cacheKey;
    }),
    TE.mapLeft((message) => {
      const ci: ControlInstruction = ['halt', message];
      return ci;
    })
  );

  return maybeTidy;
}, 'runHtmlTidy');


const verifyFileType: (urlTest: RegExp) => FilterTransform<string> = (typeTest: RegExp) => filter((filename, env) => {
  const file = path.resolve(env.entryPath(), filename);

  const test = runFileCmd(file).then(a => typeTest.test(a));
  return test;
}, `m/${typeTest.source}/`);


export const selectMetaEvidence: (name: string, attrName?: string) => Transform<BrowserPage, unknown> = (name, attrName = 'name') => {
  const evidenceName = `select:$(meta[${attrName}="${name}"])`;
  return compose(
    selectElemAttr(expandCaseVariations(name, (s) => `meta[${attrName}="${s}"]`), 'content', `meta[${attrName}="${name}"]`),
    saveEvidence(evidenceName),
  );
};

export const selectElemTextEvidence: (queryString: string) => Transform<BrowserPage, unknown> = (queryString) => {
  const evidenceName = `select:$(${queryString})`;
  return compose(
    selectOne(queryString),
    getElemText,
    saveEvidence(evidenceName),
  );
};

export const selectEachElemTextEvidence: (queryString: string) => Transform<BrowserPage, unknown> = (queryString) => {
  const evidenceName = `page.$$(${queryString})`;
  return compose(
    selectAll(queryString),
    forEachDo(compose(
      getElemText,
      saveEvidence(evidenceName),
    )),
  );
};
export const selectCombinedElemTextEvidence: (queryString: string) => Transform<BrowserPage, unknown> = (queryString) => {
  const evidenceName = `page.$$(${queryString})`;
  return compose(
    selectAll(queryString),
    forEachDo(compose(
      getElemText,
    )),
    joinLines('\n'),
    saveEvidence(evidenceName),
  );
};

export const selectElemAttrEvidence: (queryString: string, contentAttr: string) => Transform<BrowserPage, unknown> =
  (queryString, contentAttr) => {
    const evidenceName = `page.$(${queryString}).attr(${contentAttr})`;
    return compose(
      selectElemAttr(queryString, contentAttr),
      saveEvidence(evidenceName),
    );
  };

export const selectAllElemAttrEvidence: (queryString: string, contentAttr: string) => Transform<BrowserPage, unknown> =
  (queryString, contentAttr) => {
    const evidenceName = `select-all:$(${queryString}).attr(${contentAttr})`;
    return compose(
      selectAll(queryString),
      forEachDo(compose(
        getElemAttr(contentAttr),
        saveEvidence(evidenceName),
      )),
    );
  };



export const selectAllMetaEvidence: (name: string, attrName?: string) => Transform<BrowserPage, unknown> = (name, attrName = 'name') => {
  const evidenceName = `select-all:$(meta[${attrName}="${name}"])`;
  return compose(
    selectAll(expandCaseVariations(name, (s) => `meta[${attrName}="${s}"]`), `meta[${attrName}="${name}"]`),
    forEachDo(compose(
      getElemAttr('content'),
      saveEvidence(evidenceName),
    )),
  );
};

export const selectXMLPath: (selectorPath: string[]) => Transform<CacheFileKey, unknown> = (selectorPath) => {
  return compose(
    loadTextFile,
    through((a) => {
      const selected = _.get(a, selectorPath);
      return E.right(selected);
    }),
  );
};

export const selectXMLTag: (selectorPath: string[]) => Transform<CacheFileKey, unknown> = (selectorPath) => {
  const sel = selectorPath.join('.');
  const evidenceName = `xml:select:'${sel}'`;
  return compose(
    loadTextFile,
    through((a) => {
      // prettyPrint({ a, selectorPath })
      const selected = _.get(a, selectorPath);
      // prettyPrint({ selected })
      const selstr = selected.toString();
      return E.right(selstr);
    }),
    saveEvidence(evidenceName),
  );
};

const urlMatcher: (urlTest: RegExp) => Transform<unknown, unknown> = (regex) => compose(
  through((_a, env) => env.urlFetchData.responseUrl),
  filter((a: string) => regex.test(a), `url ~= m/${regex.source}/`),
);

export const statusFilter: Transform<unknown, unknown> = compose(
  through((_a, env) => env.urlFetchData.status),
  filter((a) => a === '200', 'HttpStatus ==? 200'),
);

export const normalizeHtmls: Transform<unknown, string[]> = compose(
  listResponseBodies,
  forEachDo(
    compose(
      verifyFileType(/html|xml/i),
      runHtmlTidy,
    )
  ),
);

export const urlFilter: (urlTest: RegExp) => Transform<unknown, unknown> = (regex) => compose(
  urlMatcher(regex),
  statusFilter
);

export const checkStatusAndNormalize = compose(
  log('info', (_0, env) => `Processing ${env.urlFetchData.responseUrl}`),
  log('info', (_0, env) => {
    const urlFetchData = env.urlFetchData;
    const fetchData = prettyFormat({ urlFetchData })
    return `Processing ${fetchData}`;
  }),
  statusFilter,
  normalizeHtmls,
  filter((a) => a.length > 0),
);


export const forXMLInputs: (re: RegExp, func: Transform<string, unknown>) => Transform<unknown, unknown> = (re, transform) => compose(
  listArtifactFiles('.', re),
  forEachDo(
    compose(
      loadXML,
      log('info', a => `processing input ${a}`),
      addEvidence((a) => `input:${a}`),
      transform,
      clearEvidence(/^input:/),
    )
  )
);

export const forInputs: (re: RegExp, transform: Transform<CacheFileKey, unknown>) => Transform<unknown, unknown> =
  (re, transform) => compose(
    listTidiedHtmls,
    through((inputs) => _.filter(inputs, input => re.test(input)), `m/${re.source}/`),
    forEachDo(
      compose(
        log('info', a => `processing input ${a}`),
        addEvidence((a) => `input:${a}`),
        transform,
        clearEvidence(/^input:/),
      )
    )
  );

// Convenience function for most common case: run a bunch of queries on the response page in the browser
export const withResponsePage: (transform: Transform<BrowserPage, unknown>) => Transform<unknown, unknown> =
  transform => forInputs(/response-body/, compose(loadBrowserPage(), transform));

function validateAndCleanAbstract(field: FieldRecord, log: Logger): void {
  const [cleaned0, cleaningRuleResults] = applyCleaningRules(AbstractCleaningRules, field.value, log);
  field.value = cleaned0;
  const ruleNames = _.map(cleaningRuleResults, r => {
    return `clean: ${r.rule}`;
  });
  field.evidence.push(...ruleNames);

}

function validateAndCleanPdfLinks(field: FieldRecord, pageUrl: string): void {
  const maybeUrl = toUrl(field.value, pageUrl)
  field.value = typeof maybeUrl === 'string' ? '' : maybeUrl.toString();
}

export const validateEvidence: (mapping: Record<string, string>) => Transform<unknown, unknown> =
  (mapping) => {
    const evidenceKeys = _.keys(mapping);
    const filters = _.map(evidenceKeys, e => evidenceExists(e));
    const keyEvidence = _.join(evidenceKeys, ' ++ ');


    return compose(
      takeWhileSuccess(...filters),
      tap((_a, env) => {
        env.log.debug('validateEvidence: examine candidates')
        const url = env.urlFetchData.responseUrl;

        _.each(evidenceKeys, evKey0 => {
          const fieldName = mapping[evKey0];

          env.log.debug(`validateEvidence: ${evKey0} -> ${fieldName} `);
          const evKey = evKey0.endsWith('?') ? evKey0.slice(0, -1) : evKey0;

          const evKeys = _.map(evKey.split('|'), s => s.trim());

          _.each(evKeys, (key) => {
            env.log.debug(`validateEvidence: ${key} for (${evKey0} -> ${fieldName}) `);
            const maybeCandidates = candidatesForEvidence(env, key);

            _.each(maybeCandidates, c => {
              const { text, evidence } = c;

              const field: FieldRecord = {
                name: fieldName,
                evidence: [...evidence, keyEvidence],
                value: text
              };

              env.log.debug(`validateEvidence: cleaning...`);
              if (fieldName === 'abstract') {
                validateAndCleanAbstract(field, env.log);
              } else if (fieldName.startsWith('pdf-')) {
                validateAndCleanPdfLinks(field, url);
              }
              if (field.value !== undefined && field.value.length > 0) {
                env.fields.push(field);
              }
            });
          });
        });
        saveFieldRecs(env);
      }),
      tap((_a, env) => {
        _.remove(env.fields, () => true);
        _.remove(env.fieldCandidates, () => true);
      })
    );
  };

const candidatesForEvidence: (env: ExtractionEnv, evstr: string) => FieldCandidate[] = (env, evstr) => {
  const regex = new RegExp(evstr, 'i');
  return _.filter(env.fieldCandidates, (fc) => {
    return _.some(fc.evidence, ev => regex.test(ev));
  });
};


const evidenceExists: (evstr: string) => FilterTransform<unknown> = (evstr) => filter((_a, env) => {
  if (evstr.endsWith('?')) return true;
  const evRes = _.map(evstr.split('|'), s => new RegExp(s.trim(), 'i'));
  return _.some(evRes, regex => {
    return _.some(
      env.fieldCandidates, (fc) => {
        return _.some(fc.evidence, ev => regex.test(ev));
      }
    );
  });
}, evstr);

export const summarizeEvidence: Transform<unknown, unknown> = tapEitherEnv((env) => {
  const { fieldCandidates, log } = env;
  const url = env.urlFetchData.responseUrl;

  log.log('info', `summary: URL= ${url}`);
  log.log('info', 'Field Candidates');
  _.each(fieldCandidates, fc => {
    log.log('info', `summary:     ${fc.text}`);
    _.each(fc.evidence, ev => {
      log.log('info', `summary:         ${ev}`);
    });
  });

  log.log('info', 'summary: Field Records');
  const nameValuePairs = _.toPairs(env.fieldRecs);
  _.each(nameValuePairs, ([name, fields]) => {
    env.log.log('info', `summary:     Field: ${name}  count=${fields.length}`);
    _.each(fields, field => {
      const { name, value, evidence } = field;
      log.log('info', `summary:        ${name} ==> ${value}`);
      _.each(evidence, ev => {
        log.log('info', `summary:            ${ev}`);
      });
    });
  });
  log.log('info', 'summary: ');
});


function applyCleaningRules(rules: CleaningRule[], initialString: string, log: Logger): [string, CleaningRuleResult[]] {
  let currentString = initialString;
  const cleaningResults: CleaningRuleResult[] = [];
  _.each(rules, (rule) => {
    const someGuardMatches = (
      rule.guards.length === 0
      || rule.guards.some(re => re.test(currentString))
    );

    if (!someGuardMatches) return;
    log.debug(`Applying cleaning rule: ${rule.name}`);

    const cleaned = rule.run(currentString, rule.guards);
    if (cleaned === undefined) return;
    if (cleaned !== currentString) {
      log.debug(`Applying cleaning rule: diffing changes...`);
      const changes: Change[] = [];
      cleaningResults.push({
        rule: rule.name,
        changes,
      });
      currentString = cleaned;
    }
  });
  return [currentString, cleaningResults];
}

export function initExtractionEnv(
  spiderEnv: SpiderEnv,
  urlFetchData: UrlFetchData,
): ExtractionEnv {
  //  TODO maybe replace logger name
  const env: ExtractionEnv = {
    ...spiderEnv,
    urlFetchData,
    fields: [],
    fieldRecs: {},
    fieldCandidates: [],
    evidence: [],
    fileContentCache: {},
  };
  return env;
}
