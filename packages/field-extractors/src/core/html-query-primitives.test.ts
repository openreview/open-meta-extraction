import _ from 'lodash';

import { isLeft, isRight } from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';
import { asyncEachOfSeries, prettyPrint, putStrLn, scopedGracefulExit, setLogEnvLevel, stripMargin } from '@watr/commonlib';
import { scopedBrowserInstance, scopedBrowserPool, scopedPageInstance } from '@watr/spider';

import {
  AttrSelection,
  Elem,
  evalElemAttr,
  expandCaseVariations,
  getElemAttrText,
  queryAllPage,
  queryOneElem,
  queryOnePage,
  selectElementAttrP
} from './html-query-primitives';

const tmpHtml = stripMargin(`
|<html>
|  <head>
|    <meta name="citation_author" content="Holte, Robert C." />
|    <meta name="citation_author" content="Burch, Neil" />
|    <meta name="citation_title" content="Automatic move pruning for single-agent search" />
|    <meta name="dc.Creator" content="Adam" />
|    <meta name="dc.creator" content="adam" />
|    <meta property="og:description" content="success: We consider a new learning model in which a joint distributi" />
|  </head>
|
|  <body>
|    <section class="Abstract" id="Abs1" tabindex="-1" lang="en" xml:lang="en">
|      <h2 class="Heading">
|        Abstract
|      </h2>
|      <p class="Para">
|        success: We present
|      </p>
|    </section>
|    <a class="show-pdf" href="/success:pdf">PDF</a>
|
|    <div class="Abstracts u-font-serif" id="abstracts">
|        <div class="abstract author" id="aep-abstract-id6">
|            <h2 class="section-title u-h3 u-margin-l-top u-margin-xs-bottom">
|                Abstract
|            </h2>
|            <div id="aep-abstract-sec-id7">
|                <p>
|                    success1
|                </p>
|                <p>
|                    success2
|                </p>
|            </div>
|        </div>
|    </div>
|
|  </body>
|</html>
`);

function genHtml(head: string, body: string): string {
  return stripMargin(`
|<!DOCTYPE html>
|<html>
|  <head>${head}</head>
|  <body>${body}</body>
|</html>
`);
}
type WithPageInstance = Parameters<typeof scopedPageInstance.destroy>[0]
async function* withPageContent(htmlContent: string): AsyncGenerator<WithPageInstance, void, void> {

  for await (const { gracefulExit } of scopedGracefulExit.use({})) {
    for await (const { browserPool } of scopedBrowserPool.use({ gracefulExit })) {
      for await (const { browserInstance } of scopedBrowserInstance.use({ browserPool })) {
        for await (const wpi of scopedPageInstance.use({ browserInstance })) {
          const page = wpi.pageInstance.page;
          await page.setContent(htmlContent, {
            timeout: 8000,
            waitUntil: 'domcontentloaded',
          });
          yield wpi;
        }
      }
    }
  }
}

describe('HTML jquery-like css queries', () => {

  setLogEnvLevel('info');

  it('smokescreen', async () => {
    for await (const { pageInstance } of withPageContent(tmpHtml)) {
      const page = pageInstance.page;
      const attr0 = await selectElementAttrP(page, 'meta[name=citation_title]', 'content');
      const attr1 = await selectElementAttrP(page, 'meta[name=citation_title]', 'content_');
      expect(isRight(attr0)).toEqual(true);
      expect(isLeft(attr1)).toEqual(true);
    }
  });

  it('should select elements within previously selected elements', async () => {
    const outerInner = stripMargin(`
|       <div class="outer" id="my-outer">
|         <div class="inner" id="my-inner">  </div>
|       </div>
`);
    const htmlContent = genHtml('', outerInner);
    for await (const { pageInstance } of withPageContent(htmlContent)) {
      await pipe(
        TE.right({ page: pageInstance.page }),
        TE.bind('outer', ({ page }) => () => queryOnePage(page, '.outer')),
        TE.bind('inner', ({ outer }) => () => queryOneElem(outer, '.inner')),
        TE.bind('outerId', ({ outer }) => () => evalElemAttr(outer, 'id')),
        TE.bind('innerId', ({ inner }) => () => evalElemAttr(inner, 'id')),
        TE.map(({ innerId, outerId }) => {
          expect(innerId).toEqual('my-inner');
          expect(outerId).toEqual('my-outer');
        }),
        TE.mapLeft((error) => {
          fail(error);
        })
      )();
    }
  });

  it('should select attributes from given element(s)', async () => {
    const body = stripMargin(`
|    <div id="div1" class="c0" attr-one="one">
|       <div class="c0" attr-one="two"></div>
|    </div>'
`);
    const htmlContent = genHtml('', body);
    for await (const { pageInstance } of withPageContent(htmlContent)) {
      await pipe(
        TE.right({ page: pageInstance.page }),
        TE.bind('div1', ({ page }) => () => queryOnePage(page, '#div1')),
        TE.bind('attr', ({ div1 }) => () => getElemAttrText(div1, 'attr-one')),
        TE.map(({ attr }) => {
          expect(attr).toEqual('one');
        }),
        TE.mapLeft((error) => {
          fail(error);
        })
      )();
      await pipe(
        TE.right({ page: pageInstance.page }),
        TE.bind('divs', ({ page }) => () => queryAllPage(page, '.c0')),
        TE.bind('attrs', ({ divs }) => async () => {
          const maybeAttrs = divs.map(div => getElemAttrText(div, 'attr-one'));
          const settled: AttrSelection[] = await Promise.all(maybeAttrs);
          const attValues = settled.map(maybeAtt => E.fold(
            () => 'not-found',
            succ => succ
          )(maybeAtt));
          return E.right(attValues);
        }),
        TE.map(({ attrs }) => {
          expect(attrs).toEqual(['one', 'two']);
        }),
        TE.mapLeft((error) => {
          fail(error);
        })
      )();
    }
  });

  it('should select elements based on attribute css [foo=bar]', async () => {
    const body = stripMargin(`
|    <div>
|       <div class="c0" mdata="one"></div>
|       <div class="c0" mdata="two"></div>
|    </div>'
`);
    const htmlContent = genHtml('', body);
    for await (const { pageInstance } of withPageContent(htmlContent)) {
      await pipe(
        TE.right({ page: pageInstance.page }),
        TE.bind('div1', ({ page }) => () => queryOnePage(page, '[mdata]')),
        TE.bind('attr', ({ div1 }) => () => getElemAttrText(div1, 'mdata')),
        TE.map(({ attr }) => {
          expect(attr).toEqual('one');
        }),
        TE.mapLeft((error) => {
          fail(error);
        })
      )();

      await pipe(
        TE.right({ page: pageInstance.page }),
        TE.bind('div1', ({ page }) => () => queryOnePage(page, '[mdata=two]')),
        TE.bind('attr', ({ div1 }) => () => getElemAttrText(div1, 'mdata')),
        TE.map(({ attr }) => {
          expect(attr).toEqual('two');
        }),
        TE.mapLeft((error) => {
          fail(error);
        })
      )();
    }

  });

  it('should create all expansions', () => {
    const cases1 = expandCaseVariations('A.B.C', (n) => `meta[name="${n}"]`);
    const expect1 = 'meta[name="A.B.C"],meta[name="A.B.c"],meta[name="A.b.C"],meta[name="A.b.c"],meta[name="a.B.C"],meta[name="a.B.c"],meta[name="a.b.C"],meta[name="a.b.c"]';
    expect(cases1).toBe(expect1);

    const cases2 = expandCaseVariations('DC.Creator', (n) => `meta[name="${n}"]`);
    const expect2 = 'meta[name="DC.Creator"],meta[name="DC.creator"],meta[name="Dc.Creator"],meta[name="Dc.creator"],meta[name="dC.Creator"],meta[name="dC.creator"],meta[name="dc.Creator"],meta[name="dc.creator"]';
    expect(cases2).toBe(expect2);
  });

  type ExampleType = [string, RegExp];

  it('should run assorted css queries', async () => {
    const examples: ExampleType[] = [
      ['div#abstracts > div.abstract > div', /success1/],
      ['div#abstracts > div.abstract > div', /success2/],
      ['section.abstract > p.para', /success:/],
      ['section.Abstract > p.Para', /success:/],
      ['section[class=Abstract] > p[class="Para"]', /success:/],
      ['section#abs1.abstract > p.para', /success:/],
      ['meta[property="og:description"]', /success:/],
      ['a.show-pdf', /success:pdf/],
    ];

    for await (const { pageInstance } of withPageContent(tmpHtml)) {
      const page = pageInstance.page;

      await asyncEachOfSeries(examples, async (ex: ExampleType) => {
        const [query, regexTest] = ex;
        const maybeResult = await queryOnePage(page, query);
        if (isRight(maybeResult)) {
          const elem = maybeResult.right;
          const outerHtml = await elem.evaluate(e => e.outerHTML);
          // prettyPrint({ query, outerHtml });
          expect(regexTest.test(outerHtml)).toBe(true);
        } else {
          const error = maybeResult.left;
          console.log('error', query, error);
        }
        expect(isRight(maybeResult)).toBe(true);
      });
    }
  });

  it('should run assorted css multi-queries', async () => {
    const examples: [string, RegExp[]][] = [
      // ['meta[name=citation_author]', [/Holte/, /Burch/]],
      ['meta[name="dc.Creator"]', [/Adam/]],
      ['meta[name="dc.creator"]', [/adam/]],
      ['meta[name~="dc.creator"],meta[name~="dc.Creator"]', [/Adam/, /adam/]],
    ];

    // for await (const { page: pageInstance } of usePageInstance({})) {
    for await (const { pageInstance } of withPageContent(tmpHtml)) {
      const page = pageInstance.page;
      await asyncEachOfSeries(examples, async (ex, exampleNum: number) => {
        const [query, regexTest] = ex;
        const maybeResult = await queryAllPage(page, query);
        putStrLn(`Example #${exampleNum}`);
        if (isRight(maybeResult)) {
          const elems = maybeResult.right;
          await asyncEachOfSeries(elems, async (elem: Elem, index: number) => {
            const outerHtml = await elem.evaluate(e => e.outerHTML);
            prettyPrint({ query, outerHtml, result: index });
            // const regexTest: RegExp = _.get(regexTests, index);
            // expect(regexTest.test(outerHtml)).toBe(true);
          });
        } else {
          const error = maybeResult.left;
          console.log('error', query, error);
        }
      });
    }

  });


  it('should downcase attributes', async () => {
    const examples: [string, RegExp[]][] = [
      // ['meta[name=citation_author]', [/Holte/, /Burch/]],
      ['meta[name="dc.Creator"]', [/Adam/]],
      ['meta[name="dc.creator"]', [/adam/]],
      ['meta[name~="dc.creator"],meta[name~="dc.Creator"]', [/Adam/, /adam/]],
    ];
    for await (const { pageInstance } of withPageContent(tmpHtml)) {
      const page = pageInstance.page;
      await asyncEachOfSeries(examples, async (ex, exampleNum: number) => {
        const [query, regexTest] = ex;
        const maybeResult = await queryAllPage(page, query);
        putStrLn(`Example #${exampleNum}`);
        if (isRight(maybeResult)) {
          const elems = maybeResult.right;
          await asyncEachOfSeries(elems, async (elem: Elem, index: number) => {
            const outerHtml = await elem.evaluate(e => e.outerHTML);
            prettyPrint({ query, outerHtml, index });
            // const regexTest: RegExp = _.get(regexTests, index);
            // expect(regexTest.test(outerHtml)).toBe(true);
          });
        } else {
          const error = maybeResult.left;
          console.log('error', query, error);
        }
      });
    }
  });
});
