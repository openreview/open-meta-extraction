import _ from 'lodash';

import {
  Transform,
  through,
  ClientFunc,
  CacheFileKey,
} from '~/predef/extraction-prelude';


export const loadTextFile: Transform<CacheFileKey, string> =
  through((cacheKey: CacheFileKey, { fileContentCache }) =>
    (cacheKey in fileContentCache
      ? fileContentCache[cacheKey]
      : ClientFunc.failWith(`cache has no record for key ${cacheKey}`)
    ), 'loadTextFile');

export const splitLines: Transform<string, string[]> =
  through((s: string) => s.split('\n'));

export const grepFilter: (regex: RegExp) => Transform<string[], string[]> =
  (regex) => through(
    (lines: string[]) => _.filter(lines, l => regex.test(l)),
    `grep(${regex.source})`
  );


export const grepFilterNot: (regex: RegExp) => Transform<string[], string[]> =
  (regex) => through(
    (lines: string[]) => _.filter(lines, l => !regex.test(l)),
    `grep.not(${regex.source})`
  );


export const grepDropUntil: (regex: RegExp) => Transform<string[], string[]> =
  (regex) => through(
    (lines: string[]) => _.dropWhile(lines, l => !regex.test(l)),
    `grepDropUntil(${regex.source})`
  );

export const grepTakeUntil: (regex: RegExp) => Transform<string[], string[]> =
  (regex) => through(
    (lines: string[]) => _.takeWhile(lines, l => !regex.test(l)),
    `grepTakeUntil(${regex.source})`
  );

export const dropN: (num: number) => Transform<string[], string[]> =
  (num) => through(
    (lines: string[]) => _.drop(lines, num),
    `dropN(${num})`
  );

export const joinLines: (join: string) => Transform<string[], string> =
  (joinstr) => through(
    (lines: string[]) => _.join(lines, joinstr),
    `joinLines(${joinstr})`
  );

export const multiGrepDropUntil: (regexes: RegExp[], includeMatchedLines: boolean) => Transform<string[], string[]> =
  (regexes, includeMatchedLines) => {
    return through((lines: string[]) => {
      return mgrepDropUntil(lines, regexes, includeMatchedLines);
    }, `multiGrepDropUntil(${regexes.map(r => r.source).join(' __ ')})`);
  };

export const multiGrepTakeUntil: (regexes: RegExp[], includeMatchedLines: boolean) => Transform<string[], string[]> =
  (regexes, includeMatchedLines) => {
    return through((lines: string[]) => {
      return mgrepTakeUntil(lines, regexes, includeMatchedLines);
    }, `multiGrepTakeUntil(${regexes.map(r => r.source).join(' __ ')})`);
  };

export function mgrepDropUntil(lines: string[], matchers: RegExp[], includeMatchedLines: boolean): string[] {
  const matchBegin = findMultiMatchIndex(lines, matchers);

  if (matchBegin > -1) {
    const fromIndex = includeMatchedLines ? matchBegin : matchBegin + matchers.length;
    return lines.slice(fromIndex);
  }
  return [];
}

export function mgrepTakeUntil(lines: string[], matchers: RegExp[], includeMatchedLines: boolean): string[] {
  const matchBegin = findMultiMatchIndex(lines, matchers);

  if (matchBegin > -1) {
    const toIndex = includeMatchedLines ? matchBegin + matchers.length : matchBegin;
    return lines.slice(0, toIndex);
  }
  return [];
}

export function findMultiMatchIndex(
  lines: string[],
  matchers: RegExp[],
): number {
  if (matchers.length === 0) {
    return -1;
  }
  const index = lines.findIndex((_l, lineNum) => {
    return _.every(matchers, (regex, matchNum) => {
      const currLine = lines[lineNum + matchNum];
      const haveMatch = regex.test(currLine);
      return currLine !== undefined && haveMatch;
    });
  });

  return index;
}
