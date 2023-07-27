import _ from 'lodash';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';

import {
  prettyPrint,
  getServiceLogger,
  getCorpusRootDir,
} from '@watr/commonlib';

import { CanonicalFieldRecords, ExtractionEnv, getEnvCanonicalFields, SpiderAndExtractionTransform } from '@watr/field-extractors';

import { BrowserPool, createBrowserPool, createSpiderEnv, UrlFetchData } from '@watr/spider';

import { Logger } from 'winston';
import { ShadowDB } from './shadow-db';
import { UrlStatus, WorkflowStatus } from '~/db/schemas';
import { TaskScheduler, withTaskScheduler, WithTaskScheduler } from './task-scheduler';
import { parseIntOrElse } from '~/util/misc';
import { WithMongoGenArgs } from '~/db/mongodb';

export async function createExtractionService(
  shadowDB: ShadowDB,
  taskScheduler: TaskScheduler,
  postResultsToOpenReview: boolean
): Promise<ExtractionService> {
  const browserPool: BrowserPool = createBrowserPool();
  const corpusRoot = getCorpusRootDir();

  const s = new ExtractionService(
    corpusRoot,
    shadowDB,
    taskScheduler,
    browserPool,
    postResultsToOpenReview
  );
  await s.connect();
  return s;
}
export type WithExtractionService = WithTaskScheduler & {
  extractionService: ExtractionService
};

type WithExtractionServiceArgs = WithMongoGenArgs & {
  postResultsToOpenReview: boolean;
}

export async function* withExtractionService(args: WithExtractionServiceArgs): AsyncGenerator<WithExtractionService, void, any> {
  for await (const components of withTaskScheduler(args)) {
    const { postResultsToOpenReview } = args;
    const { taskScheduler, shadowDB  } = components;
    const extractionService = await createExtractionService(shadowDB, taskScheduler, postResultsToOpenReview);
    yield _.merge({}, components, { extractionService });
  }
}

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


  async connect() {
    await this.shadowDB.connect();
  }

  async close() {
    await this.shadowDB.close();
    await this.browserPool.shutdown();
  }

  // Main Extraction Loop
  async runExtractionLoop(limit: number) {
    let currCount = 0;
    const runForever = limit === 0;

    for await (const urlStatus of this.taskScheduler.genUrlStream()) {
      if (runForever) {
        await this.extractUrl(urlStatus);
        continue;
      }

      currCount++;
      if (currCount >= limit) {
        break;
      }
    }
  }

  // Run extraction on a single URL
  async extractUrl(urlStatus: UrlStatus) {
    this.log.debug(`Extracting URL = ${urlStatus.requestUrl}`);

    const noteId = urlStatus.noteId;
    const url = new URL(urlStatus.requestUrl);
    await this.updateWorkflowStatus(noteId, 'processing');

    const spiderEnv = await createSpiderEnv(this.log, this.browserPool, this.corpusRoot, url);

    await this.updateWorkflowStatus(noteId, 'spider:begun');
    const fieldExtractionResults = await SpiderAndExtractionTransform(TE.right([url, spiderEnv]))()
      .catch(async error => {
        prettyPrint({ error })
        await this.updateWorkflowStatus(noteId, 'extractor:fail');
        throw error;
      });


    if (E.isLeft(fieldExtractionResults)) {
      const [, { urlFetchData }] = fieldExtractionResults.left;
      await this.recordExtractionFailure(noteId, urlFetchData);
      return;
    }

    const [, extractionEnv] = fieldExtractionResults.right;
    await this.recordExtractionResults(noteId, extractionEnv);
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
    prettyPrint({ canonicalFields, theAbstract, pdfLink });

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

  // async runExtractionLoop({ limit, postResultsToOpenReview }: RunRelayExtract) {
  //   const this = this;
  //   let currCount = 0;
  //   const runForever = limit === 0;

  //   const corpusRoot = getCorpusRootDir();
  //   const browserPool = createBrowserPool();

  //   // Rate limits
  //   const pauseIntervalAfterNoteExhaustion = 2 * oneHour;
  //   const minTimePerIteration = 5 * oneSecond;
  //   let currTime = new Date();

  //   async function stopCondition(msg: string): Promise<boolean> {
  //     putStrLn(`stopCondition(msg=${msg})`);
  //     if (msg === 'done') {
  //       if (runForever) {
  //         // Pause before exiting.
  //         // PM2 will relaunch immediately
  //         await delay(pauseIntervalAfterNoteExhaustion)
  //       }

  //       return true;
  //     }
  //     await browserPool.clearCache();
  //     browserPool.report();
  //     const atCountLimit = currCount >= limit;
  //     prettyPrint({ atCountLimit, runForever })
  //     putStrLn(`stop? atCountLimit(${atCountLimit} = curr:${currCount} >= lim:${limit}`)
  //     if (atCountLimit && !runForever) {
  //       return true;
  //     }
  //     currTime = await self.rateLimit(currTime, minTimePerIteration);
  //     return atCountLimit && !runForever;
  //   }

  //   return asyncDoUntil(
  //     async () => {
  //       const nextNoteCursor = await this.shadowDB.getNextAvailableUrl();
  //       // update URL workflow status
  //       const msg = `nextNoteCursor=${nextNoteCursor?.noteId}; num=${nextNoteCursor?.noteNumber}`;
  //       putStrLn(msg);
  //       this.log.debug(msg);

  //       if (!nextNoteCursor) {
  //         this.log.info('No more spiderable URLs available');
  //         return 'done';
  //       }
  //       const nextUrlStatus = await this.shadowDB.getUrlStatusForCursor(nextNoteCursor);
  //       if (!nextUrlStatus) {
  //         throw new Error(`Invalid state: nextNoteCursor(${nextNoteCursor.noteId}) had not corresponding urlStatus`)
  //       }
  //       this.log.debug(`next Host = ${nextUrlStatus.requestUrl}`);

  //       currCount += 1;

  //       const noteId = nextUrlStatus._id;
  //       const url = nextUrlStatus.requestUrl;
  //       self.log.info(`Starting URL: ${url}`);
  //       await this.updateWorkflowStatus(noteId, 'processing');

  //       const spiderEnv = await createSpiderEnv(self.log, browserPool, corpusRoot, new URL(url));
  //       const init = new URL(url);
  //       self.log.debug(`Created Spidering Environment`);

  //       await this.updateWorkflowStatus(noteId, 'spider:begun');
  //       const fieldExtractionResults = await SpiderAndExtractionTransform(TE.right([init, spiderEnv]))()
  //         .catch(async error => {
  //           prettyPrint({ error })
  //           await this.updateWorkflowStatus(noteId, 'extractor:fail');
  //           throw error;
  //         });


  //       if (E.isLeft(fieldExtractionResults)) {
  //         const [errCode, { urlFetchData }] = fieldExtractionResults.left;
  //         self.log.debug(`Extraction Failed, exiting...`);

  //         const { status } = urlFetchData;
  //         let httpStatus = 0;
  //         try { httpStatus = Number.parseInt(status); } catch {}

  //         await this.shadowDB.mdb.updateUrlStatus(noteId, {
  //           httpStatus,
  //           // response: responseUrl
  //         });
  //         prettyPrint({ errCode, urlFetchData });

  //         await this.updateWorkflowStatus(noteId, 'extractor:fail');
  //         await this.shadowDB.releaseSpiderableUrl(nextNoteCursor);
  //         return 'continue';
  //       }

  //       self.log.debug(`Extraction succeeded, continuing...`);
  //       await this.updateWorkflowStatus(noteId, 'extractor:success');

  //       const [, extractionEnv] = fieldExtractionResults.right;

  //       const { status, responseUrl } = extractionEnv.urlFetchData;
  //       let httpStatus = 0;
  //       try { httpStatus = Number.parseInt(status); } catch {}

  //       const canonicalFields = getEnvCanonicalFields(extractionEnv);


  //       await this.updateWorkflowStatus(noteId, 'extractor:success');
  //       const theAbstract = chooseCanonicalAbstract(canonicalFields);
  //       const hasAbstract = theAbstract !== undefined;
  //       const pdfLink = chooseCanonicalPdfLink(canonicalFields);
  //       const hasPdfLink = pdfLink !== undefined;
  //       prettyPrint({ canonicalFields, theAbstract, pdfLink });

  //       if (postResultsToOpenReview) {
  //         if (hasAbstract) {
  //           await this.shadowDB.updateFieldStatus(noteId, 'abstract', theAbstract);
  //         }
  //         if (hasPdfLink) {
  //           await this.shadowDB.updateFieldStatus(noteId, 'pdf', pdfLink);
  //         }
  //         await this.updateWorkflowStatus(noteId, 'fields:posted');
  //       }

  //       await this.shadowDB.releaseSpiderableUrl(nextNoteCursor);
  //       await this.shadowDB.mdb.updateUrlStatus(noteId, {
  //         hasAbstract,
  //         hasPdfLink,
  //         httpStatus,
  //         response: responseUrl
  //       });
  //       return 'continue';
  //     },
  //     stopCondition
  //   ).finally(async () => {
  //     await browserPool.shutdown();
  //     await this.shadowDB.close();
  //   });
  // }

  // async rateLimit(prevTime: Date, maxRateMs: number): Promise<Date> {
  //   const currTime = new Date();
  //   const elapsedMs = differenceInMilliseconds(currTime, prevTime);
  //   const waitTime = maxRateMs - elapsedMs;

  //   if (waitTime > 0) {
  //     this.log.info(`Delaying ${waitTime / 1000} seconds...`);
  //     await delay(waitTime);
  //   }
  //   return currTime;
  // }
