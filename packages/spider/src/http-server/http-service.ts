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
  composeScopes,
  gracefulExitExecScope,
  withScopedExec,
} from '@watr/commonlib';

export type Router = KoaRouter;

type HttpServerNeeds = {
  gracefulExit: GracefulExit;
  routerSetup: (router: Router, port: number) => void;
  baseUrl: URL;
  port: number;
};

export class HttpServer {
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


export const httpServerExecScope = () => withScopedExec<
  HttpServer,
  'httpServer',
  HttpServerNeeds
>(
  async function init({ gracefulExit, routerSetup, baseUrl, port }) {
    const log = getServiceLogger('HttpServer');
    const routes = new KoaRouter();
    const app = new Koa();
    app.use(koaBody());
    app.use(json({ pretty: false }));


    const server = await new Promise<Server>((resolve) => {
      const server = app.listen(port, () => {
        resolve(server);
      });
    });
    const address = server.address()
    const maybePort = address && typeof address !== 'string' && address.port;
    const portInUse = typeof maybePort === 'number' ? maybePort : port;
    log.info(`Koa is listening to ${baseUrl} on ${portInUse}`);

    routerSetup(routes, portInUse);

    app.use(routes.routes());
    app.use(routes.allowedMethods());

    const closedP = onServerClosedP(server);

    gracefulExit.addHandler(async () => {
      log.info('Closing Server');
      server.close();
      await closedP;
    });

    const httpServer = new HttpServer(server, closedP, portInUse);
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
