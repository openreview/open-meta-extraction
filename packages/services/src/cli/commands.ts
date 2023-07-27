import _ from 'lodash';


import { arglib, initConfig, putStrLn } from '@watr/commonlib';
import { formatStatusMessages, showStatusSummary } from '~/db/extraction-summary';
import { connectToMongoDB, mongoConnectionString, resetMongoDB } from '~/db/mongodb';
import { createFetchService } from '~/components/fetch-service';
import { createExtractionService, withExtractionService } from '~/components/extraction-service';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { runMonitor } from '~/components/monitor-service';
import { CursorRoles, createMongoQueries, isCursorRole } from '~/db/query-api';
import { TaskScheduler } from '~/components/task-scheduler';


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
    const fetchService = await createFetchService();
    await fetchService.runFetchLoop(limit);
    await fetchService.close();
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

    const mdb = await createMongoQueries();

    try {
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
        const didDelete = await mdb.deleteCursor(role);
        const msg = didDelete ? 'deleted' : 'not deleted';
        putStrLn(`Cursor was ${msg}`);
        return;
      }

      if (_.isBoolean(create) && create) {
        putStrLn(`Creating cursor w/role ${role}`);
        const taskScheduler = new TaskScheduler(mdb);
        await taskScheduler.createUrlCursor(role);
        return;
      }

      putStrLn('No operation specifed...');

    } finally {
      putStrLn('Closing DB');
      await mdb.close();
    }

  });

  registerCmd(
    yargv,
    'run-monitor-service',
    'Periodically send notifications with system monitor report',
    config(
      opt.flag('send-notification'),
    )
  )(async (args: any) => {
    const { sendNotification } = args;
    await runMonitor({ sendNotification });
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
    // TODO limit not enabled

    for await (const { extractionService } of withExtractionService({ postResultsToOpenReview })) {
      await extractionService.runExtractionLoop(limit);
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
