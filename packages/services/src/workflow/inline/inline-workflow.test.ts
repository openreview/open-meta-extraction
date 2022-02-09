import _ from 'lodash';
import { getCorpusEntryDirForUrl, prettyPrint } from '@watr/commonlib';
import fs from 'fs-extra';
import Async from 'async';
import { Server } from 'http';
import { runServicesInlineWithDB, WorkflowServices } from './inline-workflow';

import { getServiceLogger } from '@watr/commonlib';
import { startSpiderableTestServer } from '~/http-servers/rest-portal/mock-server';
import { getDBConfig } from '~/db/database';
import { DatabaseContext } from '~/db/db-api';
import { createEmptyDB } from '~/db/db-test-utils';
import { extractFieldsForEntry, initExtractionEnv, readUrlFetchData } from '@watr/field-extractors';
import { mockAlphaRecord } from '@watr/spider';
import { createSpiderService } from '~/workflow/distributed/spider-worker';

describe('End-to-end Extraction workflows', () => {
  const nodeEnv = process.env['NODE_ENV'];
  prettyPrint({ nodeEnv });
  const workingDir = './test.scratch.d';
  const dbConfig = getDBConfig();
  const dbCtx: DatabaseContext | undefined = dbConfig ? { dbConfig } : undefined;
  expect(dbCtx).toBeDefined;
  if (dbConfig === undefined || dbCtx === undefined) return;

  let server: Server | undefined;

  beforeEach(async () => {
    prettyPrint({ dbConfig });
    fs.emptyDirSync(workingDir);
    fs.removeSync(workingDir);
    fs.mkdirSync(workingDir);
    return startSpiderableTestServer()
      .then(s => {
        server = s;
      })
      .then(() => createEmptyDB(dbConfig))
      .then((db) => db.close());
  });


  afterEach(() => {
    return new Promise<void>((resolve) => {
      if (server !== undefined) {
        server.close(() => resolve());
      }
    });
  });


  it('should fetch alpha records', async () => {
    const log = getServiceLogger('test-service');

    const spiderService = await createSpiderService();

    const workflowServices: WorkflowServices = {
      spiderService,
      log,
      dbCtx
    };
    const exampleUrls = [
      '/200~withFields',
      // '/200~withoutFields',
      // '/404~custom404~100',
      // '/404~custom404',
    ];

    await Async.eachOfSeries(exampleUrls, Async.asyncify(async (urlPath: string, exampleNumber: number) => {
      const url = `http://localhost:9100${urlPath}`
      const alphaRec = mockAlphaRecord(1, url);
      const fetchedRecord = await runServicesInlineWithDB(dbCtx, workflowServices, alphaRec);
      prettyPrint({ exampleNumber, fetchedRecord });
    }));


    await spiderService.quit();
  });

  it('should update database if fields are extracted but no db entry exists', async () => {
    const log = getServiceLogger('test-service');

    const spiderService = await createSpiderService();
    const browserPool = spiderService.scraper.browserPool;

    const workflowServices: WorkflowServices = {
      spiderService,
      log,
      dbCtx
    };
    const exampleUrls = [
      '/200~withFields',
    ];

    await Async.eachOfSeries(exampleUrls, Async.asyncify(async (urlPath: string, exampleNumber: number) => {
      const url = `http://localhost:9100${urlPath}`
      const alphaRec = mockAlphaRecord(1, url);
      await spiderService
        .scrape(url)
        .catch((error: Error) => {
          return `${error.name}: ${error.message}`;
        });

      const entryPath = getCorpusEntryDirForUrl(url);

      const urlFetchData = readUrlFetchData(entryPath);
      const sharedEnv = {
        log,
        browserPool,
        urlFetchData
      };
      const exEnv = await initExtractionEnv(entryPath, sharedEnv);
      await extractFieldsForEntry(exEnv);

      const fetchedRecord = await runServicesInlineWithDB(dbCtx, workflowServices, alphaRec);
      prettyPrint({ exampleNumber, fetchedRecord });
    }));

    await spiderService.quit();
  });
});
