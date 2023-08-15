import _ from 'lodash';
import { Context } from 'koa';
import Router from '@koa/router';

import {
  stripMargin,
  getServiceLogger,
  prettyPrint,
  gracefulExitExecScope,
  ConfigProvider,
  GracefulExit,
} from '@watr/commonlib';

import fs from 'fs-extra';
import { HttpServer, httpServerExecScope } from '~/http-server/http-service';

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


type TestHttpServerArgs = {
  config: ConfigProvider;
  routerSetup: (router: Router, port: number) => void;
};


type HttpTestServer = {
  gracefulExit: GracefulExit;
  httpServer: HttpServer;
}

export async function* withHttpTestServer({ config, routerSetup }: TestHttpServerArgs): AsyncGenerator<HttpTestServer> {

  const openreviewEndpoint = config.get('openreview:restApi');
  const baseUrl = new URL(openreviewEndpoint);
  baseUrl.port = '';
  const port = 0;

  for await (const { gracefulExit } of gracefulExitExecScope()({})) {
    for await (const { httpServer } of httpServerExecScope()({ gracefulExit, routerSetup, port, baseUrl })) {
      const openreviewEndpoint = config.get('openreview:restApi');
      const baseUrl = new URL(openreviewEndpoint);
      const port = httpServer.port;
      baseUrl.port = port.toString();
      config.set('openreview:restApi', baseUrl.toString());
      yield { gracefulExit, httpServer };
    }
  }
}

type Args = {
  config: ConfigProvider;
  workingDir?: string;
}

export async function* useTestingHttpServer({ config, workingDir }: Args): AsyncGenerator<void, void, any> {

  for await (const __ of withHttpTestServer({ config, routerSetup: testHtmlRoutes })) {
    if (workingDir) {
      fs.emptyDirSync(workingDir);
      fs.removeSync(workingDir);
      fs.mkdirSync(workingDir);
    }
    yield;
  }
}
