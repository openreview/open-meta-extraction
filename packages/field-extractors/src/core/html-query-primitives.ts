/// <reference lib="dom" />

import _ from 'lodash';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import { pipe } from 'fp-ts/function';

import {
  Page,
  ElementHandle,
} from 'puppeteer';

import { DefaultPageInstanceOptions, PageInstanceOptions } from '@watr/spider';

import {
  Transform,
  through,
  ClientFunc,
  CacheFileKey,
  compose
} from '~/predef/extraction-prelude';

export type AttrSelection = E.Either<string, string>;
export type Elem = ElementHandle<Element>;
export type ElemSelection = E.Either<string, Elem>;
export type ElemMultiSelection = E.Either<string, Elem[]>;

export type BrowserPage = Page;

function formatCSSSelectionError(error: unknown, cssSelector: string): string {
  if (error instanceof Error) {
    const msg = error.message;

    if (/failed.to.find.element.matching.selector/.test(msg)) {
      return `no match for ${cssSelector}`;
    }
    return `${error.message}`;
  }
  return `?${error}`;
}

export function expandCaseVariations(seed: string, sub: (s: string) => string): string {
  const variations = _.reduce(seed, (acc, char) => {
    const isUpper = char >= 'A' && char <= 'Z';
    return _.flatMap(acc, (elem) => {
      if (isUpper) return [elem + char, elem + char.toLowerCase()];
      return [elem + char.toLowerCase()];
    });
  }, ['']);

  const expanded = _.join(
    _.map(variations, v => sub(v)),
    ','
  );

  return expanded;
}

export async function queryAllPage(page: Page, query: string): Promise<ElemMultiSelection> {
  try {
    const elems: ElementHandle<Element>[] = await page.$$(query);
    return E.right(elems);
  } catch (error) {
    const msg = formatCSSSelectionError(error, query);
    return E.left(msg);
  }
}

export async function queryAllElem(elem: Elem, query: string): Promise<ElemMultiSelection> {
  try {
    const elems: ElementHandle<Element>[] = await elem.$$(query);
    return E.right(elems);
  } catch (error) {
    const msg = formatCSSSelectionError(error, query);
    return E.left(msg);
  }
}

export async function queryOnePage(page: Page, query: string): Promise<ElemSelection> {
  return queryAllPage(page, query)
    .then(elems => {
      return pipe(elems, E.chain(es => {
        return es.length > 0
          ? E.right(es[0])
          : E.left(`empty selection '${query}'`);
      }));
    });
}

export async function queryOneElem(elem: Elem, query: string): Promise<ElemSelection> {
  return queryAllElem(elem, query)
    .then(elems => {
      return pipe(elems, E.chain(es => {
        return es.length > 0
          ? E.right(es[0])
          : E.left(`empty selection '${query}'`);
      }));
    });
}

export async function selectElementAttrP(
  page: Page,
  elementSelector: string,
  attributeName: string,
  selectorDesc?: string
): Promise<AttrSelection> {
  const displayDesc = selectorDesc ? selectorDesc : elementSelector;
  try {
    const maybeAttr = await page.$eval(elementSelector, (elem: Element, attr: unknown) => {
      if (typeof attr !== 'string') {
        throw new TypeError(`attr ${attr} did not eval to string`);
      }
      const attrValue = elem.getAttribute(attr);
      return { attrValue };
    }, attributeName);

    if (maybeAttr === null) return E.left(`empty selection '${displayDesc}'`);

    const { attrValue } = maybeAttr;
    if (attrValue === null) return E.left(`no attr ${attributeName} in select('${displayDesc}')`);

    return E.right(attrValue);
  } catch (error) {
    const msg = formatCSSSelectionError(error, displayDesc);
    return E.left(msg);
  }
}

export async function getElemAttrText(
  elem: Elem,
  attributeName: string
): Promise<AttrSelection> {
  const attrValue = await elem.evaluate((elem: Element, attr: string) => {
    return elem.getAttribute(attr);
  }, attributeName);

  if (attrValue === null) {
    return E.left(`no attr ${attributeName} in elem[${attributeName}])`);
  }
  return E.right(attrValue);
}



export const elemQueryOne: (queryString: string) => Transform<Elem, Elem> =
  (queryString) => through((elem: Elem, { }) => {
    return pipe(
      () => queryOneElem(elem, queryString),
      TE.mapLeft((msg) => ['continue', msg])
    );
  }, `elem.$(${queryString})`);


export async function evalElemText(elem: Elem): Promise<E.Either<string, string>> {
  return elem.evaluate(e => e.textContent)
    .then(text => {
      if (text === null)
        return E.left('no text found in elem');
      return E.right(text.trim());
    });
}

export async function evalElemOuterHtml(elem: Elem): Promise<E.Either<string, string>> {
  return elem.evaluate(e => e.outerHTML)
    .then(text => {
      if (text === null)
        return E.left('no outerHtml found for elem');
      return E.right(text.trim());
    });
}

export async function evalElemAttr(elem: Elem, attr: string): Promise<E.Either<string, string>> {
  return elem.evaluate((e, attrname) => e.getAttribute(attrname), attr)
    .then(text => (text === null
      ? E.left(`evalElemAttr: no attr '${attr}' found`)
      : E.right(text)))
    .catch((error) => {
      return E.left(`evalElemAttr: ${error}`);
    });
}

export const getElemAttr: (attr: string) => Transform<Elem, string> =
  (attr: string) => through((elem: Elem, { }) => {
    return pipe(
      () => evalElemAttr(elem, attr),
      TE.mapLeft((msg) => ['continue', msg]),
    );
  }, 'getElemAttr');


export const getElemText: Transform<Elem, string> =
  through((elem: Elem) => {
    return pipe(
      () => evalElemText(elem),
      TE.mapLeft((msg) => ['continue', msg]),
    );
  }, 'getElemText');


export const getElemOuterHtml: Transform<Elem, string> =
  through((elem: Elem) => {
    return pipe(
      () => evalElemOuterHtml(elem),
      TE.mapLeft((msg) => ['continue', msg]),
    );
  }, 'getElemOuterHtml');


export const loadBrowserPage: (pageOptions?: PageInstanceOptions) => Transform<CacheFileKey, Page> =
  (pageOpts = DefaultPageInstanceOptions) => through((cacheKey: CacheFileKey, env) => {
    const{ browserPageCache, fileContentCache, browserInstance, log } = env;

    if (cacheKey in browserPageCache) {
      log.debug('loading browser page from cache');
      return browserPageCache[cacheKey].page;
    }

    if (cacheKey in fileContentCache) {
      log.debug('loading new browser page');
      const fileContent = fileContentCache[cacheKey];
      const pagePromise = browserInstance.newPage(pageOpts)
        .then(async (pageInstance) => {
          const { page } = pageInstance;
          await page.setContent(fileContent, {
            timeout: 8000,
            waitUntil: 'domcontentloaded',
          });
          log.debug('..loaded new browser page');
          browserPageCache[cacheKey] = pageInstance;
          return page;
        });
      return pagePromise;
    }

    return ClientFunc.failure(`cache has no record for key ${cacheKey}`);
  });

export const selectOne: (queryString: string) => Transform<BrowserPage, Elem> =
  (queryString) => through((page: Page, { }) => {
    return pipe(
      () => queryOnePage(page, queryString),
      TE.mapLeft((msg) => ['continue', msg])
    );
  }, `page.$(${queryString})`);


export const selectAll: (queryString: string, abbrev?: string) => Transform<Page, Elem[]> =
  (queryString, abbrev) => compose(
    through((page: Page, { }) => {
      return pipe(
        () => queryAllPage(page, queryString),
        TE.mapLeft((msg) => ['continue', msg])
      );
    }, `selectAll(${abbrev ? abbrev : queryString})`)
  );

export const selectElemAttr: (queryString: string, contentAttr: string, queryDesc?: string) => Transform<Page, string> =
  (queryString, contentAttr, queryDesc) => compose(
    through((page: Page, { }) => {
      return pipe(
        () => selectElementAttrP(page, queryString, contentAttr, queryDesc),
        TE.mapLeft((msg) => ['continue', msg])
      );
    }, `selectElemAttr(${queryDesc ? queryDesc : queryString}, ${contentAttr})`)
  );
