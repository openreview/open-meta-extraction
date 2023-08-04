import _ from 'lodash';
import Koa from 'koa';
import KoaRouter from '@koa/router';
import { koaBody } from 'koa-body';
import json from 'koa-json';
import { Server } from 'http';
import Application from 'koa';
import { prettyPrint, putStrLn } from '@watr/commonlib';

export type Router = KoaRouter;

type UseHttpServerArgs = {
  setup: (router: Router) => void,
  port: number
};

type WithHttpServer = {
  httpServer: Server,
  keepAlive: Promise<void>
}

export async function* useHttpServer({
  setup,
  port
}: UseHttpServerArgs): AsyncGenerator<WithHttpServer, void, any> {
  const routes = new KoaRouter();
  const app = new Koa();
  app.use(koaBody());
  app.use(json({ pretty: false }));

  setup(routes);

  app.use(routes.routes());
  app.use(routes.allowedMethods());


  const httpServer = await new Promise<Server>((resolve) => {
    const server = app.listen(port, () => {
      putStrLn(`Koa is listening to http://localhost:${port}`);
      resolve(server);
    });
  });

  const keepAlive = new Promise<void>((resolve) => {
    httpServer.on('close', () => {
      resolve();
    });
  });

  try {
    yield { httpServer, keepAlive };
  } finally {
    await closeServer(httpServer);
  }
}


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

export async function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined) return;
  return new Promise((resolve) => {
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
