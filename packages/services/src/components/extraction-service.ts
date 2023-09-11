import _ from 'lodash';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';

import {
  prettyPrint,
  getServiceLogger,
  getCorpusRootDir,
  prettyFormat,
  withScopedExec,
  composeScopes,
  putStrLn,
} from '@watr/commonlib';


import { BrowserPool, createSpiderEnv } from '@watr/spider';

import { CanonicalFieldRecords, ExtractionEnv, ExtractionResult, getEnvCanonicalFields, SpiderAndExtractionTransform } from '@watr/field-extractors';

import { Logger } from 'winston';
import { ShadowDB } from './shadow-db';
import { DBModels, UrlStatus, WorkflowStatus } from '~/db/schemas';
import { taskSchedulerScopeWithDeps, TaskScheduler } from './task-scheduler';
import { parseIntOrElse } from '~/util/misc';
import * as mh from '~/db/query-clauses';
import { PipelineStage } from 'mongoose';

type ExtractionServiceNeeds = {
  shadowDB: ShadowDB,
  browserPool: BrowserPool,
  taskScheduler: TaskScheduler,
  postResultsToOpenReview: boolean
};

const ExtractionTaskName = 'spider/extract-fields';

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

  async runDummy() {
  }
  async registerTasks() {
    const svc: ExtractionService = this;

    this.taskScheduler.registerTask(
      svc,
      svc.runDummy,
      this.shadowDB.mongoQueries.dbModels.urlStatus,
      'noteNumber',
      -1
    );
  }

  async initTasks() {
    const task = await this.taskScheduler.initTask(
      ExtractionTaskName,
      this.shadowDB.mongoQueries.dbModels.urlStatus,
      'noteNumber',
      -1
    );
  }

  // Main Extraction Loop
  async runExtractionLoop(limit: number, rateLimited: boolean) {
    const runForever = limit === 0;
    this.log.info(`Starting extraction loop, runForever=${runForever} postResultsToOpenReview: ${this.postResultsToOpenReview}`);
    const maxRateMS = rateLimited ? 4000 : 0;
    const generator = this.taskScheduler.taskStreamRateLimited(ExtractionTaskName, maxRateMS);

    let currCount = 0;
    for await (const noteNumber of generator) {
      const urlStatus = await this.shadowDB.mongoQueries.dbModels.urlStatus.findOne({ noteNumber });
      if (!urlStatus) {
        this.log.error(`No UrlStatus found for noteNumber ${noteNumber}`);
        return;
      }
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

  async extractUrl(url: URL): Promise<ExtractionResult<any>> {
    const spiderEnv = await createSpiderEnv(this.log, this.browserPool, this.corpusRoot, url);

    const fieldExtractionResults = await SpiderAndExtractionTransform(TE.right([url, spiderEnv]))()
      .catch(async (error: any) => {
        prettyPrint({ error })
        throw error;
      }).finally(async () => {
        const { browserPool, browserInstance } = spiderEnv;
        await browserPool.release(browserInstance);
        browserPool.report();
      });

    return fieldExtractionResults;

  }


  async updateWorkflowStatus(noteId: string, workflowStatus: WorkflowStatus): Promise<boolean> {
    const update = await this.shadowDB.mongoQueries.updateUrlStatus(noteId, { workflowStatus });
    if (!update) {
      this.log.error(`Problem updating workflow status='${workflowStatus}' for note ${noteId}`)
    }
    return !!update;
  }

  async recordExtractionResults(noteId: string, result: ExtractionResult<any>) {
    const extractionEnv = E.isLeft(result) ? result.left[1] : result.right[1];
    const { status, responseUrl } = extractionEnv.urlFetchData;
    const httpStatus = parseIntOrElse(status, 0);
    await this.shadowDB.mongoQueries.updateUrlStatus(noteId, {
      httpStatus,
      response: responseUrl
    });

    if (E.isLeft(result)) {
      return;
    }

    await this.recordExtractionSuccess(noteId, extractionEnv);
  }

  async recordExtractionSuccess(noteId: string, extractionEnv: ExtractionEnv) {
    this.log.debug(`Extraction succeeded, continuing...`);

    const canonicalFields = getEnvCanonicalFields(extractionEnv);

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
    }

    await this.shadowDB.mongoQueries.updateUrlStatus(noteId, {
      hasAbstract,
      hasPdfLink,
    });
  }

}

export const scopedExtractionService = () => withScopedExec<
  ExtractionService,
  'extractionService',
  ExtractionServiceNeeds
>(
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

export const scopedExtractionServiceWithDeps = () => composeScopes(
  taskSchedulerScopeWithDeps(),
  scopedExtractionService()
);


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
  newAbstracts: mh.CountPerDay[];
  newPdfLinks: mh.CountPerDay[];
  abstractCount: number;
  pdfCount: number;
  onlyAbstractCount: number;
  onlyPdfCount: number;
}

export async function extractionServiceMonitor(dbModels: DBModels): Promise<ExtractionServiceMonitor> {
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

  const res = await dbModels.fieldStatus.aggregate([{
    $facet: {
      newAbstracts: [matchAbstracts, mh.countByDay('createdAt'), mh.sortByDay],
      newPdfLinks: [matchPdfLinks, mh.countByDay('createdAt'), mh.sortByDay],
    }
  }]);

  const fsAbstractCount = await dbModels.fieldStatus.countDocuments({ fieldType: 'abstract' })
  const fsPdfCount = await dbModels.fieldStatus.countDocuments({ fieldType: 'pdf' })
  const usAbstractCount = await dbModels.urlStatus.countDocuments({ hasAbstract: true })
  const usOnlyAbstractCount = await dbModels.urlStatus.countDocuments({ hasAbstract: true, hasPdfLink: false })
  const usPdfCount = await dbModels.urlStatus.countDocuments({ hasPdfLink: true })
  const usOnlyPdfCount = await dbModels.urlStatus.countDocuments({ hasPdfLink: true, hasAbstract: false })

  // Top success domains
  //       withAbstractsByDomain: [selectValidResponse, (200 http status) groupByDomainHasAbstract, { $sort: { _id: 1 } }],
  // Top failed/partial missing domains

  const sortGroupIDAscending: PipelineStage.Sort = {
    $sort: { _id: 1 }
  };
  const selectValidResponseURL: PipelineStage.Match = {
    $match: {
      validResponseUrl: true,
    }
  };
  const groupByDomainHasAbstract: PipelineStage.Group = {
    $group: {
      _id: {
        $concat: ['$responseHost', '__', { $toString: '$hasAbstract' }]
      },
      count: {
        $sum: 1
      },
    }
  };

  const responseHostsWithAbstract = await dbModels.urlStatus.aggregate([{
    $facet: {
      withAbstracts: [selectValidResponseURL, groupByDomainHasAbstract, sortGroupIDAscending],
    }
  }]);

  const withAbstractGroups: GroupingRec[] = responseHostsWithAbstract[0]['withAbstracts']

  // TODO finish reporting hosts with and w/o abstracts, pdf links
  const withAbstractDict = groupDict(withAbstractGroups);

  if (fsAbstractCount != usAbstractCount) {
    putStrLn(`Warning: FieldStatus:abstractCount(${fsAbstractCount}) != UrlStatus.abstractCount(${usAbstractCount})`);
  }

  if (fsPdfCount != usPdfCount) {
    putStrLn(`Warning: FieldStatus:pdfCount(${fsPdfCount}) != UrlStatus.pdfCount(${usPdfCount})`);
  }

  const newAbstracts = _.map(res[0].newAbstracts, ({ _id, count }) => {
    return { day: _id, count };
  });
  const newPdfLinks = _.map(res[0].newPdfLinks, ({ _id, count }) => {
    return { day: _id, count };
  });

  return {
    newAbstracts,
    newPdfLinks,
    abstractCount: usAbstractCount,
    pdfCount: usPdfCount,
    onlyAbstractCount: usOnlyAbstractCount,
    onlyPdfCount: usOnlyPdfCount,
  };
}

interface GroupingRec {
  _id: string;
  count: number;
}

interface GroupCounts {
  id: string;
  trueCount: number;
  falseCount: number;
}

function groupDict(groupingRecs: GroupingRec[]): Record<string, GroupCounts> {
  const gcounts: Record<string, GroupCounts> = {};
  _.forEach(groupingRecs, ({ _id, count }) => {
    const [id, idVal] = _id.split('__');
    const gc = gcounts[id] || {
      id, trueCount: 0, falseCount: 0
    };
    if (idVal === 'true') {
      gc.trueCount = count;
    } else {
      gc.falseCount = count;
    }
    gcounts[id] = gc;
  });
  return gcounts;
}
