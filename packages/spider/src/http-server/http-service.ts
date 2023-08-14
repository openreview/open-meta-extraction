import _ from 'lodash';
import Koa from 'koa';
import KoaRouter from '@koa/router';
import { koaBody } from 'koa-body';
import json from 'koa-json';
import { Server } from 'http';
import Application from 'koa';
import {
  prettyPrint,
  putStrLn,
  getServiceLogger,
  GracefulExit,
  newIdGenerator,
  composeScopes,
  gracefulExitExecScope,
  withScopedExec
} from '@watr/commonlib';

export type Router = KoaRouter;

type HttpServerNeeds = {
  gracefulExit: GracefulExit;
  routerSetup: (router: Router) => void;
  port: number;
  useUniqPort?: boolean;
};

class HttpServer {
  server: Server;
  port: number;
  onClosedPromise: Promise<void>
  constructor(server: Server, onClosedPromise: Promise<void>, port: number) {
    this.server = server
    this.onClosedPromise = onClosedPromise;
    this.port = port;
  }
  async keepAlive(): Promise<void> {
    return this.onClosedPromise;
  }
}

const idGen = newIdGenerator(1);

export const httpServerExecScope = () => withScopedExec<
  HttpServer,
  'httpServer',
  HttpServerNeeds
>(
  async function init({ gracefulExit, routerSetup, port, useUniqPort }) {
    const log = getServiceLogger('HttpServer');
    const routes = new KoaRouter();
    const app = new Koa();
    app.use(koaBody());
    app.use(json({ pretty: false }));

    routerSetup(routes);

    app.use(routes.routes());
    app.use(routes.allowedMethods());

    const usePort = useUniqPort? port + idGen() : port;

    const server = await new Promise<Server>((resolve) => {
      const server = app.listen(usePort, () => {
        log.info(`Koa is listening to http://localhost:${usePort}`);
        resolve(server);
      });
    });

    const closedP = onServerClosedP(server);

    gracefulExit.addHandler(async () => {
      log.info('Closing Server');
      server.close();
      await closedP;
    });

    const httpServer = new HttpServer(server, closedP, usePort);
    return { httpServer };
  },
  async function destroy({ httpServer }) {
    httpServer.server.close();
    await httpServer.onClosedPromise;
  },
);


export const httpServerExecScopeWithDeps = () => composeScopes(
  gracefulExitExecScope(),
  httpServerExecScope()
);

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
