import _ from 'lodash';

import { arglib, composeScopes, loadConfig, oneHour, putStrLn } from '@watr/commonlib';
import { formatStatusMessages, showStatusSummary } from '~/db/extraction-summary';
import { connectToMongoDB, mongoConnectionString, resetMongoDB, scopedMongoose } from '~/db/mongodb';
import { scopedFetchServiceWithDeps } from '~/components/fetch-service';
import { scopedExtractionService } from '~/components/extraction-service';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { scopedMonitorServiceWithDeps } from '~/components/monitor-service';
import { CursorRoles, isCursorRole, mongoQueriesExecScope } from '~/db/query-api';
import { scopedTaskSchedulerWithDeps } from '~/components/task-scheduler';
import { scopedBrowserPool } from '@watr/spider';

const { opt, config, registerCmd } = arglib;

export function registerCLICommands(yargv: arglib.YArgsT) {
  registerCmd(
    yargv,
    'extraction-summary',
    'Show A Summary of Spidering/Extraction Progress',
    config(
    )
  )(async () => {
    putStrLn('Extraction Summary');
    const config = loadConfig();
    const mongoose = await connectToMongoDB(config);
    const summaryMessages = await showStatusSummary();
    const formatted = formatStatusMessages(summaryMessages);
    putStrLn(formatted);
    await mongoose.connection.close();
  });

  registerCmd(
    yargv,
    'run-fetch-service',
    'Fetch new OpenReview URLs into local DB for spidering/extraction',
    opt.num('limit: Only fetch the specified # of notes before exiting', 0),
    opt.flag('pause-before-exit: Only fetch the specified # of notes before exiting', false),
  )(async (args: any) => {
    const { limit, pauseBeforeExit } = args;

    for await (const { fetchService } of scopedFetchServiceWithDeps()({})) {
      await fetchService.runFetchLoop(limit, pauseBeforeExit);
    }
  });

  registerCmd(
    yargv,
    'list-cursors',
    'Show all current cursors',
    config(
      opt.flag('delete: delete all cursors', false),
    )
  )(async (args: any) => {
    const del = args.delete;

    const config = loadConfig();
    for await (const { mongoose } of scopedMongoose()({ useUniqTestDB: true, config })) {
      for await (const { mongoQueries } of mongoQueriesExecScope()({ mongoose })) {
        const cursors = await mongoQueries.getCursors()
        cursors.forEach(c => {
          putStrLn(`> ${c.role} = id:${c.noteId} number:${c.noteNumber} created:${c.createdAt}`);
        });

        if (_.isBoolean(del) && del) {
          await mongoQueries.deleteCursors();
        }
      }
    }
  });


  registerCmd(
    yargv,
    'update-cursor',
    'Create/update/delete pointers to last fetched/extracted',
    config(
      opt.str('role: the cursor role to operate on'),
      opt.flag('create: delete the named cursor', false),
      opt.flag('delete: delete the named cursor', false),
      opt.num('move: Move the cursor forward/backward by the specified number', 0),
    )
  )(async (args: any) => {
    const role = args.role;
    const del = args.delete;
    const create = args.create;
    const move = args.move;

    if (!isCursorRole(role)) {
      putStrLn(`Not a valid cursor role: ${role}`)
      const r = CursorRoles.join(', ')
      putStrLn(`Roles are: ${r}`)
      return;
    }

    for await (const { taskScheduler, mongoQueries } of scopedTaskSchedulerWithDeps()({})) {

      if (_.isNumber(move) && move !== 0) {
        putStrLn(`Moving cursor w/role ${role}`);
        const cursor = await mongoQueries.getCursor(role);
        if (cursor) {
          putStrLn(`Moving cursor ${cursor.noteId}`);
          const movedCursor = await mongoQueries.moveCursor(cursor._id, move);
          if (_.isString(movedCursor)) {
            putStrLn(`Did Not move cursor: ${movedCursor}`);
            return;
          }
          putStrLn(`Moved cursor ${cursor.noteId} to ${movedCursor.noteId}`);
        } else {
          putStrLn(`No cursor with role ${role}`);
        }
        return;
      }

      if (_.isBoolean(del) && del) {
        await taskScheduler.deleteUrlCursor(role);
        return;
      }

      if (_.isBoolean(create) && create) {
        await taskScheduler.createUrlCursor(role);
        return;
      }

      putStrLn('No operation specifed...');
    }

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
    for await (const { monitorService } of scopedMonitorServiceWithDeps()({
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
  )(async (args: any) => {
    const postResultsToOpenReview: boolean = args.postResults;
    const limit: number = args.limit;

    // const composition = composeScopes(
    //   scopedBrowserPool,
    //   scopedExtractionServiceWithDeps
    // )
    const composition = composeScopes(
      composeScopes(
        scopedTaskSchedulerWithDeps(),
        scopedBrowserPool()
      ),
      scopedExtractionService()
    );


    for await (const { extractionService } of composition({ postResultsToOpenReview })) {
      await extractionService.runExtractionLoop(limit, true);
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

    const composition = composeScopes(
      composeScopes(
        scopedTaskSchedulerWithDeps(),
        scopedBrowserPool()
      ),
      scopedExtractionService()
    );

    for await (const { extractionService } of composition({ postResultsToOpenReview })) {
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
      putStrLn('Cleaning Database');
      const mongoose = await connectToMongoDB(config);
      await resetMongoDB();
      putStrLn('Close connections');
      await mongoose.connection.close();
      putStrLn('...done');
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
