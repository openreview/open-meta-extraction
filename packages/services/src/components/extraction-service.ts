import _ from 'lodash';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';

import {
  prettyPrint,
  getServiceLogger,
  getCorpusRootDir,
  prettyFormat,
  makeScopedResource,
} from '@watr/commonlib';


import { BrowserPool, createSpiderEnv, UrlFetchData } from '@watr/spider';

import { CanonicalFieldRecords, ExtractionEnv, getEnvCanonicalFields, SpiderAndExtractionTransform } from '@watr/field-extractors';

import { Logger } from 'winston';
import { ShadowDB } from './shadow-db';
import { FieldStatus, UrlStatus, WorkflowStatus } from '~/db/schemas';
import { TaskScheduler } from './task-scheduler';
import { parseIntOrElse } from '~/util/misc';
import * as mh from '~/db/mongo-helpers';

// async function createExtractionService(
//   shadowDB: ShadowDB,
//   browserPool: BrowserPool,
//   taskScheduler: TaskScheduler,
//   postResultsToOpenReview: boolean
// ): Promise<ExtractionService> {
//   const corpusRoot = getCorpusRootDir();

//   const s = new ExtractionService(
//     corpusRoot,
//     shadowDB,
//     taskScheduler,
//     browserPool,
//     postResultsToOpenReview
//   );

//   // await s.connect();
//   return s;
// }
// export type WithExtractionService = WithTaskScheduler & {
//   extractionService: ExtractionService
// };

// type WithExtractionServiceArgs = UseMongooseArgs & {
//   postResultsToOpenReview: boolean;
// }

// export async function* withExtractionService(args: WithExtractionServiceArgs): AsyncGenerator<WithExtractionService, void, any> {
//   const { postResultsToOpenReview } = args;
//   for await (const components of withTaskScheduler(args)) {
//     const { taskScheduler, shadowDB } = components;

//     // TODO pull shutdown hooks higher than useBrowserPool
//     for await (const { browserPool } of useBrowserPool({})) {
//       const extractionService = await createExtractionService(shadowDB, browserPool, taskScheduler, postResultsToOpenReview);
//       yield _.merge({}, components, { extractionService });
//     }
//   }
// }

type ExtractionServiceNeeds = {
  shadowDB: ShadowDB,
  browserPool: BrowserPool,
  taskScheduler: TaskScheduler,
  postResultsToOpenReview: boolean
};

export const scopedExtractionService = makeScopedResource<
  ExtractionService,
  'extractionService',
  ExtractionServiceNeeds
>(
  'extractionService',
  async function init({ shadowDB, taskScheduler, browserPool, postResultsToOpenReview }) {
    const corpusRoot = getCorpusRootDir();
    const extractionService = new ExtractionService(
      corpusRoot,
      shadowDB,
      taskScheduler,
      browserPool,
      postResultsToOpenReview
    );
    return { extractionService };
  },
  async function destroy() {
  },
);

export class ExtractionService {
  log: Logger;
  shadowDB: ShadowDB;
  browserPool: BrowserPool;
  taskScheduler: TaskScheduler
  postResultsToOpenReview: boolean;
  corpusRoot: string;

  constructor(
    corpusRoot: string,
    shadowDB: ShadowDB,
    taskScheduler: TaskScheduler,
    browserPool: BrowserPool,
    postResultsToOpenReview: boolean,
  ) {
    this.log = getServiceLogger('ExtractionService');
    this.shadowDB = shadowDB;
    this.taskScheduler = taskScheduler;
    this.postResultsToOpenReview = postResultsToOpenReview
    this.corpusRoot = corpusRoot;
    this.browserPool = browserPool;
  }


  // async connect() {
  //   await this.shadowDB.connect();
  // }

  // async close() {
  //   await this.shadowDB.close();
  //   await this.browserPool.shutdown();
  // }

  // Main Extraction Loop
  async runExtractionLoop(limit: number, rateLimited: boolean) {
    const runForever = limit === 0;
    this.log.info(`Starting extraction loop, runForever=${runForever}`);
    const maxRateMS = rateLimited ? 5000 : 0;
    const generator = this.taskScheduler.genUrlStreamRateLimited(maxRateMS)

    let currCount = 0;
    for await (const urlStatus of generator) {
      await this.extractUrlStatus(urlStatus);
      if (runForever) {
        continue;
      }

      currCount++;
      if (currCount >= limit) {
        return;
      }
    }
  }

  // Run extraction on a single URL
  async extractUrlStatus(urlStatus: UrlStatus) {
    this.log.debug(`Extracting URL = ${urlStatus.requestUrl}`);

    const noteId = urlStatus.noteId;
    const url = new URL(urlStatus.requestUrl);
    const extractionEnv = await this.extractUrl(url);

    if (extractionEnv) {
      await this.recordExtractionResults(noteId, extractionEnv);
    }
  }

  async extractUrl(url: URL, noteId?: string) {

    if (noteId) {
      await this.updateWorkflowStatus(noteId, 'processing');
    }

    const spiderEnv = await createSpiderEnv(this.log, this.browserPool, this.corpusRoot, url);

    if (noteId) {
      await this.updateWorkflowStatus(noteId, 'spider:begun');
    }
    const fieldExtractionResults = await SpiderAndExtractionTransform(TE.right([url, spiderEnv]))()
      .catch(async (error: any) => {
        prettyPrint({ error })
        if (noteId) {
          await this.updateWorkflowStatus(noteId, 'extractor:fail');
        }
        throw error;
      }).finally(async () => {
        const { browserPool, browserInstance } = spiderEnv;
        await browserPool.release(browserInstance);
        browserPool.report();
      });


    if (E.isLeft(fieldExtractionResults)) {
      const asdf = fieldExtractionResults.left;
      const urlFetchData = asdf[1].urlFetchData;
      if (noteId) {
        await this.recordExtractionFailure(noteId, urlFetchData);
      }
      return;
    }

    const [, extractionEnv] = fieldExtractionResults.right;
    return extractionEnv
  }


  async updateWorkflowStatus(noteId: string, workflowStatus: WorkflowStatus): Promise<boolean> {
    const update = await this.shadowDB.mdb.updateUrlStatus(noteId, { workflowStatus });
    if (!update) {
      this.log.error(`Problem updating workflow status='${workflowStatus}' for note ${noteId}`)
    }
    return !!update;
  }

  // Record successful extraction results
  async recordExtractionResults(noteId: string, extractionEnv: ExtractionEnv) {
    this.log.debug(`Extraction succeeded, continuing...`);

    const { status, responseUrl } = extractionEnv.urlFetchData;
    const httpStatus = parseIntOrElse(status, 0);

    const canonicalFields = getEnvCanonicalFields(extractionEnv);


    await this.updateWorkflowStatus(noteId, 'extractor:success');
    const theAbstract = chooseCanonicalAbstract(canonicalFields);
    const hasAbstract = theAbstract !== undefined;
    const pdfLink = chooseCanonicalPdfLink(canonicalFields);
    const hasPdfLink = pdfLink !== undefined;
    const msg = prettyFormat({ canonicalFields, theAbstract, pdfLink });
    this.log.info(msg)

    if (this.postResultsToOpenReview) {
      if (hasAbstract) {
        await this.shadowDB.updateFieldStatus(noteId, 'abstract', theAbstract);
      }
      if (hasPdfLink) {
        await this.shadowDB.updateFieldStatus(noteId, 'pdf', pdfLink);
      }
      await this.updateWorkflowStatus(noteId, 'fields:posted');
    }

    await this.shadowDB.mdb.updateUrlStatus(noteId, {
      hasAbstract,
      hasPdfLink,
      httpStatus,
      response: responseUrl
    });
  }

  async recordExtractionFailure(noteId: string, urlFetchData: UrlFetchData) {
    this.log.debug(`Extraction Failed, exiting...`);

    const { status } = urlFetchData;
    const httpStatus = parseIntOrElse(status, 0);

    await this.shadowDB.mdb.updateUrlStatus(noteId, {
      httpStatus,
    });
    prettyPrint({ urlFetchData });

    await this.updateWorkflowStatus(noteId, 'extractor:fail');
  }
}

function chooseCanonicalAbstract(canonicalFields: CanonicalFieldRecords): string | undefined {
  const abstracts = _.filter(canonicalFields.fields, (field) => field.name === 'abstract');
  const clippedAbstracts = _.filter(canonicalFields.fields, (field) => field.name === 'abstract-clipped');
  let theAbstract: string | undefined;
  if (abstracts.length > 0) {
    theAbstract = abstracts[0].value;
  } else if (clippedAbstracts.length > 0) {
    theAbstract = clippedAbstracts[0].value;
  }

  return theAbstract;
}

function chooseCanonicalPdfLink(canonicalFields: CanonicalFieldRecords): string | undefined {
  const pdfLinks = _.filter(canonicalFields.fields, (field) => field.name === 'pdf-link');
  if (pdfLinks.length > 0) {
    return pdfLinks[0].value;
  }
}

export interface ExtractionServiceMonitor {
  newAbstracts: mh.CountPerDay[]
  newPdfLinks: mh.CountPerDay[]
}

export async function extractionServiceMonitor(): Promise<ExtractionServiceMonitor> {
  //// Fields extracted per day
  // Abstracts
  const matchAbstracts = mh.matchAll(
    mh.matchCreatedAtDaysFromToday(-7),
    mh.matchFieldVal('fieldType', 'abstract')
  );

  // Pdf Links
  const matchPdfLinks = mh.matchAll(
    mh.matchCreatedAtDaysFromToday(-7),
    mh.matchFieldVal('fieldType', 'pdf')
  );

  const res = await FieldStatus.aggregate([{
    $facet: {
      newAbstracts: [matchAbstracts, mh.countByDay('createdAt'), mh.sortByDay],
      newPdfLinks: [matchPdfLinks, mh.countByDay('createdAt'), mh.sortByDay],
    }
  }]);
  prettyPrint({ res })

  const newAbstracts = _.map(res[0].newAbstracts, ({ _id, count }) => {
    return { day: _id, count };
  });
  const newPdfLinks = _.map(res[0].newPdfLinks, ({ _id, count }) => {
    return { day: _id, count };
  });

  return { newAbstracts, newPdfLinks };
}
