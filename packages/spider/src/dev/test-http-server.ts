import _ from 'lodash';
import { Context } from 'koa';
import Router from '@koa/router';

import {
  stripMargin,
  getServiceLogger,
  prettyPrint,
  gracefulExitExecScope,
} from '@watr/commonlib';

import fs from 'fs-extra';
import { httpServerExecScope, httpServerExecScopeWithDeps } from '~/http-server/http-service';

const withFields = stripMargin(`
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

const withoutFields = `
<html> <head> </head> <body> </body> </html>
`;

const htmlSamples: Record<string, string> = {
  withFields,
  withoutFields,
  custom404: '<html><body>404 Not Found</body></html>'
};



export function testHtmlRoutes(router: Router) {
  // const router = new Router({ routerPath: '/echo' });
  const log = getServiceLogger('test-server');

  router.get('/echo', async (ctx: Context) => {
    log.info(`${ctx.method} ${ctx.path}`);
    const { response } = ctx;
    const query = ctx.query;
    response.type = 'application/json';
    response.status = 200;
    response.body = query || {};
  })

  router.get(/[/]htmls[/].*/, async (ctx: Context, next: () => Promise<any>) => {
    const { response, path } = ctx;
    log.info(`html router; ${path}`);
    prettyPrint({ testServer: path });
    const pathTail = path.slice('/htmls/'.length);
    // const pathTail = path.slice(1);
    const [status, respKey, maybeTimeout] = pathTail.split(/~/);
    const timeout = maybeTimeout ? Number.parseInt(maybeTimeout) : 0;
    prettyPrint({ status, respKey, timeout });

    response.type = 'html';
    response.status = Number.parseInt(status, 10);
    response.body = htmlSamples[respKey] || 'Unknown';
    await next();
  });
}

type Args = {
  port: number,
  workingDir?: string
}

export async function* useTestingHttpServer({ port, workingDir }: Args): AsyncGenerator<void, void, any> {

  for await (const {} of httpServerExecScopeWithDeps()({ useUniqPort: false, port, routerSetup: testHtmlRoutes })) {
  }

  for await (const { gracefulExit } of gracefulExitExecScope()({})) {
    for await (const {} of httpServerExecScope()({ gracefulExit, useUniqPort: false, port, routerSetup: testHtmlRoutes })) {
      if (workingDir) {
        fs.emptyDirSync(workingDir);
        fs.removeSync(workingDir);
        fs.mkdirSync(workingDir);
      }
      yield;
    }
  }
}
