import _ from 'lodash';

import { arglib, initConfig, putStrLn } from '@watr/commonlib';
import { formatStatusMessages, showStatusSummary } from '~/db/extraction-summary';
import { connectToMongoDB, mongoConnectionString, resetMongoDB } from '~/db/mongodb';
import { useFetchService } from '~/components/fetch-service';
import { withExtractionService } from '~/components/extraction-service';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { runMonitor } from '~/components/monitor-service';
import { CursorRoles, createMongoQueries, isCursorRole } from '~/db/query-api';
import { withTaskScheduler } from '~/components/task-scheduler';

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
    initConfig();
    const mongoose = await connectToMongoDB();
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
  )(async (args: any) => {
    const { limit } = args;

    for await (const { fetchService } of useFetchService({})) {
      await fetchService.runFetchLoop(limit);
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

    const mdb = await createMongoQueries();

    try {
      const cursors = await mdb.getCursors()
      cursors.forEach(c => {
        putStrLn(`> ${c.role} = id:${c.noteId} number:${c.noteNumber} created:${c.createdAt}`);
      });

      if (_.isBoolean(del) && del) {
        await mdb.deleteCursors();
      }

    } finally {
      putStrLn('Closing DB');
      await mdb.close();
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


    for await (const { taskScheduler, mdb } of withTaskScheduler({})) {
      if (_.isNumber(move) && move !== 0) {
        putStrLn(`Moving cursor w/role ${role}`);
        const cursor = await mdb.getCursor(role);
        if (cursor) {
          putStrLn(`Moving cursor ${cursor.noteId}`);
          const movedCursor = await mdb.moveCursor(cursor._id, move);
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
      opt.flag('send-notification'),
      opt.flag('start-server'),
      opt.num('port'),
    )
  )(async (args: any) => {
    const { sendNotification, startServer, port } = args;
    await runMonitor({ sendNotification, startServer, port });
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

    for await (const { extractionService } of withExtractionService({ postResultsToOpenReview })) {
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
    for await (const { extractionService } of withExtractionService({ postResultsToOpenReview })) {
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
    initConfig();
    const conn = mongoConnectionString();
    putStrLn('Mongo Tools');
    putStrLn(`Connection: ${conn}`);

    if (clean) {
      putStrLn('Cleaning Database');
      const mongoose = await connectToMongoDB();
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
    initConfig();
    const openreviewGateway = new OpenReviewGateway();
    await openreviewGateway.testNoteFetching();
  });
}
