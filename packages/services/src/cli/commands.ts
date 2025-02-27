import _ from 'lodash';

import { arglib, composeScopes, delay, loadConfig, oneHour, putStrLn } from '@watr/commonlib';
import { mongoConnectionString, mongoConfig, scopedMongoose } from '~/db/mongodb';
import { fetchServiceExecScopeWithDeps } from '~/components/fetch-service';
import { scopedExtractionService } from '~/components/extraction-service';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { monitorServiceExecScopeWithDeps } from '~/components/monitor-service';
import { mongoQueriesExecScope } from '~/db/query-api';
import { taskSchedulerScopeWithDeps } from '~/components/task-scheduler';
import { scopedBrowserPool } from '@watr/spider';
import { shadowDBExecScope, shadowDBConfig } from '~/components/shadow-db';

const { opt, config, registerCmd } = arglib;

export function registerCLICommands(yargv: arglib.YArgsT) {
  registerCmd(
    yargv,
    'run-fetch-service',
    'Fetch new OpenReview URLs into local DB for spidering/extraction',
    opt.num('limit: Only fetch the specified # of notes before exiting', 0),
    opt.flag('pause-before-exit: pause before exiting to avoid immediate PM2 restart', false),
  )(async (args: any) => {
    const { limit, pauseBeforeExit } = args;

    const config = shadowDBConfig();
    for await (const { fetchService } of fetchServiceExecScopeWithDeps()(config)) {
      await fetchService.runFetchLoop(limit, pauseBeforeExit);
    }
  });


  registerCmd(
    yargv,
    'manage-tasks',
    'Create/delete extraction tasks and show status',
    config(
      opt.str('role: the cursor role to operate on'),
      opt.flag('create: delete the named cursor', false),
      opt.flag('delete: delete the named cursor', false),
      opt.num('move: Move the cursor forward/backward by the specified number', 0),
    )
  )(async (args: any) => {
    //   const role = args.role;
    //   const del = args.delete;
    //   const create = args.create;
    //   const move = args.move;

    //   if (!isCursorRole(role)) {
    //     putStrLn(`Not a valid cursor role: ${role}`)
    //     const r = CursorRoles.join(', ')
    //     putStrLn(`Roles are: ${r}`)
    //     return;
    //   }

    for await (const { taskScheduler } of taskSchedulerScopeWithDeps()(mongoConfig())) {
    }

    //     if (_.isNumber(move) && move !== 0) {
    //       putStrLn(`Moving cursor w/role ${role}`);
    //       const cursor = await mongoQueries.getCursor(role);
    //       if (cursor) {
    //         putStrLn(`Moving cursor ${cursor.noteId}`);
    //         const movedCursor = await mongoQueries.moveCursor(cursor._id, move);
    //         if (_.isString(movedCursor)) {
    //           putStrLn(`Did Not move cursor: ${movedCursor}`);
    //           return;
    //         }
    //         putStrLn(`Moved cursor ${cursor.noteId} to ${movedCursor.noteId}`);
    //       } else {
    //         putStrLn(`No cursor with role ${role}`);
    //       }
    //       return;
    //     }

    //     if (_.isBoolean(del) && del) {
    //       await taskScheduler.deleteUrlCursor(role);
    //       return;
    //     }

    //     if (_.isBoolean(create) && create) {
    //       await taskScheduler.createUrlCursor(role);
    //       return;
    //     }

    //     putStrLn('No operation specifed...');
    //   }

  });

  registerCmd(
    yargv,
    'run-monitor-service',
    'Periodically send notifications with system monitor report',
    config(
      opt.flag('send-notifications: if true, post notification back to the Openreview API'),
      opt.flag('start-server: if true, start a server, otherwise just print a monitor summary'),
      opt.num('port: port for the server', 0),
      opt.num('update-interval: how frequently to run update queries', 0),
      opt.num('notify-interval: how frequently to send out notifications', 0),
    )
  )(async (args: any) => {
    const { sendNotifications, startServer, port } = args;
    const { updateInterval, notifyInterval } = args;

    const monitorUpdateInterval = updateInterval > 0 ? updateInterval : oneHour;
    const monitorNotificationInterval = notifyInterval > 0 ? notifyInterval : oneHour * 12;

    for await (const { monitorService } of monitorServiceExecScopeWithDeps()({
      ...mongoConfig(),
      sendNotifications,
      monitorNotificationInterval,
      monitorUpdateInterval
    })) {
      if (startServer) {
        await monitorService.runServer(port);
      } else {
        await monitorService.notify();
      }
    }
  });

  registerCmd(
    yargv,
    'run-extraction-service',
    'Spider new URLs, extract metadata, and POST results back to OpenReview API',
    opt.num('limit: Only extract the specified # of notes before exiting', 0),
    opt.flag('post-results'),
    opt.flag('pause-before-exit: pause before exiting to avoid immediate PM2 restart', false),
  )(async (args: any) => {
    const postResultsToOpenReview: boolean = args.postResults;
    const limit: number = args.limit;
    const pauseBeforeExit: number = args.pauseBeforeExit;

    const composition = composeScopes(
      taskSchedulerScopeWithDeps(),
      mongoQueriesExecScope(),
      shadowDBExecScope(),
      scopedBrowserPool(),
      scopedExtractionService()
    );

    const config = shadowDBConfig();

    for await (const { extractionService } of composition({
      ...config,
      postResultsToOpenReview // TODO merge this with 'writeChangesToOpenReview'
    })) {
      await extractionService.runExtractNewlyImported(limit, true);
    }

    if (pauseBeforeExit) {
      const oneSecond = 1000;
      const oneMinute = 60 * oneSecond;
      // const oneHour = 60 * oneMinute;
      const fiveMinutes = 5 * oneMinute;
      putStrLn('Delaying for 5 minutes before restart');
      await delay(fiveMinutes)
    }
  });

  registerCmd(
    yargv,
    'extract-url',
    'Run extraction loop on a single url, nothing is recorded or posted to openreview',
    opt.str('url: The url to spider/extract'),
  )(async (args: any) => {
    const postResultsToOpenReview: boolean = args.postResults;
    const urlstr: string = args.url;
    const url = new URL(urlstr);

    const config = shadowDBConfig();
    const composition = composeScopes(
      taskSchedulerScopeWithDeps(),
      mongoQueriesExecScope(),
      shadowDBExecScope(),
      scopedBrowserPool(),
      scopedExtractionService()
    );

    for await (const { extractionService } of composition({
      ...config,
      postResultsToOpenReview
    })) {
      await extractionService.extractUrl(url);
    }

  });

  registerCmd(
    yargv,
    'mongo-tools',
    'Create/Delete/Update Mongo Database',
    opt.flag('clean'),
  )(async (args: any) => {
    const { clean } = args;
    const config = loadConfig();
    const conn = mongoConnectionString(config);
    putStrLn('Mongo Tools');
    putStrLn(`Connection: ${conn}`);

    if (clean) {
      for await (const { mongoDB } of scopedMongoose()(mongoConfig())) {
        await mongoDB.dropDatabase();
        await mongoDB.createCollections();
      }
    }
  });

  registerCmd(
    yargv,
    'openreview-api',
    'Interact with OpenReview.net REST API',
  )(async () => {
    const config = loadConfig();
    const openreviewGateway = new OpenReviewGateway(config);
    await openreviewGateway.testNoteFetching();
  });
}
