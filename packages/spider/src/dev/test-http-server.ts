import _ from 'lodash';
import Koa, { Context } from 'koa';
import Router from '@koa/router';
import { koaBody } from 'koa-body';
import { Server } from 'http';
import axios from 'axios';

import {
  putStrLn,
  stripMargin,
  getServiceLogger,
  prettyPrint
} from '@watr/commonlib';

import fs from 'fs-extra';
import Application from 'koa';

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

const log = getServiceLogger('test-server');


function htmlRouter(): Router<Koa.DefaultState, Koa.DefaultContext> {
  const router = new Router({ routerPath: '/echo' });

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


  return router;
}




export type WithServerCallbackArgs = {
  server: Server;
};


export async function* withServerGen(
  setup: (router: Router) => void,
): AsyncGenerator<Server, void, any> {
  const routes = new Router();
  const app = new Koa();
  app.use(koaBody());

  setup(routes);
  // TODO config port
  const port = 9100;


  app.use(routes.routes());
  app.use(routes.allowedMethods());

  const server = await new Promise<Server>((resolve) => {
    const server = app.listen(port, () => {
      log.info(`Koa is listening to http://localhost:${port}`);
      resolve(server);
    });
  });
  try {
    yield server;
  } finally {
    await closeTestServer(server);
  }
}

export async function isGETEqual(
  url: string,
  data: any
) {
  const resp = await axios.get(url);
  expect(resp.data).toEqual(data);
}

export async function isPOSTEqual(
  url: string,
  data: any
) {
  const resp = await axios.post(url);
  expect(resp.data).toEqual(data);
}

export function respondWith(
  body: Record<string, any>
): (ctx: Application.ParameterizedContext) => void {
  return (ctx) => {
    const { response } = ctx;
    response.type = 'application/json';
    response.status = 200;
    response.body = body;
  };
}

export function responseHandler(
  body: Record<string, any>
): (ctx: Application.ParameterizedContext) => void {
  return (ctx) => {
    const { response } = ctx;
    response.type = 'application/json';
    response.status = 200;
    response.body = body;
  };
}


export function respondWithHtml(
  body: string
): (ctx: Application.ParameterizedContext) => void {
  return (ctx) => {
    const { response } = ctx;
    response.type = 'text/html';
    response.status = 200;
    response.body = body;
  };
}

export async function startTestServer(): Promise<Server> {
  const app = new Koa();

  const port = 9100;

  const htmlRoutes = htmlRouter();

  app.use(htmlRoutes.routes());
  app.use(htmlRoutes.allowedMethods());

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      log.info(`Koa is listening to http://localhost:${port}`);
      resolve(server);
    });
  });
}

export async function resetTestServer(workingDir: string): Promise<Server> {
  fs.emptyDirSync(workingDir);
  fs.removeSync(workingDir);
  fs.mkdirSync(workingDir);
  return startTestServer();
}

export async function closeTestServer(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (server === undefined) return;
    server.on('close', () => {
      putStrLn('test server closed.');
    });
    server.close((error?: Error) => {
      putStrLn('test server close Callback.');
      if (error) {
        prettyPrint({ error })
      }
      resolve(undefined);
    });
  });
}
