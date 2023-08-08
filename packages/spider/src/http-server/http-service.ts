import _ from 'lodash';
import Koa from 'koa';
import KoaRouter from '@koa/router';
import { koaBody } from 'koa-body';
import json from 'koa-json';
import { Server } from 'http';
import Application from 'koa';
import { prettyPrint, putStrLn, getServiceLogger, GracefulExit, withScopedResource } from '@watr/commonlib';

export type Router = KoaRouter;

type HttpServerNeeds = {
  gracefulExit: GracefulExit;
  routerSetup: (router: Router) => void;
  port: number;
};


class HttpServer {
  server: Server;
  onClosedPromise: Promise<void>
  constructor(server: Server, onClosedPromise: Promise<void>) {
    this.server = server
    this.onClosedPromise = onClosedPromise;
  }
  async keepAlive(): Promise<void> {
    return this.onClosedPromise;
  }
}

export const scopedHttpServer = withScopedResource<
  HttpServer,
  'httpServer',
  HttpServerNeeds
>(
  'httpServer',
  async function init({ gracefulExit, routerSetup, port }) {
    const log = getServiceLogger('HttpServer');
    const routes = new KoaRouter();
    const app = new Koa();
    app.use(koaBody());
    app.use(json({ pretty: false }));

    routerSetup(routes);

    app.use(routes.routes());
    app.use(routes.allowedMethods());


    const server = await new Promise<Server>((resolve) => {
      const server = app.listen(port, () => {
        log.info(`Koa is listening to http://localhost:${port}`);
        resolve(server);
      });
    });

    const closedP = onServerClosedP(server);
    // const keepAlive = closedP;

    gracefulExit.addHandler(async () => {
      log.info('Closing Server');
      server.close();
      await closedP;
    });

    const httpServer = new HttpServer(server, closedP);
    return { httpServer };
  },
  async function destroy({ httpServer }) {
    httpServer.server.close();
    await httpServer.onClosedPromise;
  },
);


// type UseHttpServerArgs = Partial<WithGracefulExit> & {
//   setup: (router: Router) => void,
//   port: number,
// };


// export async function* useHttpServer({
//   setup,
//   port,
//   gracefulExit
// }: UseHttpServerArgs): AsyncGenerator<WithHttpServer, void, any> {
//   const log = getServiceLogger('HttpServer');
//   const routes = new KoaRouter();
//   const app = new Koa();
//   app.use(koaBody());
//   app.use(json({ pretty: false }));

//   setup(routes);

//   app.use(routes.routes());
//   app.use(routes.allowedMethods());


//   for await (const comps of useGracefulExit({ gracefulExit })) {
//     const httpServer = await new Promise<Server>((resolve) => {
//       const server = app.listen(port, () => {
//         log.info(`Koa is listening to http://localhost:${port}`);
//         resolve(server);
//       });
//     });

//     const closedP = onServerClosedP(httpServer);
//     const keepAlive = closedP;

//     comps.gracefulExit.addHandler(async () => {
//       log.info('Closing Server');
//       httpServer.close();
//       await closedP;
//     });
//     yield { httpServer, keepAlive };
//   }

// }


export function respondWithJson(
  body: Record<string, any>
): (ctx: Application.ParameterizedContext) => void {
  return (ctx) => {
    const { response } = ctx;
    response.type = 'application/json';
    response.status = 200;
    response.body = body;
  };
}

export function respondWithPlainText(
  body: string
): (ctx: Application.ParameterizedContext) => void {
  return (ctx) => {
    const { response } = ctx;
    response.type = 'text/plain';
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

export async function onServerClosedP(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.on('close', (error?: Error) => {
      putStrLn('Server event: closed.');
      if (error) {
        prettyPrint({ error })
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined) return;
  const closedP = onServerClosedP(server);
  server.close();
  return closedP
}
