import _ from 'lodash';
import path from 'path';
import {
  createHubService,
  createSatelliteService,
  defineSatelliteService,
  SatelliteService,
  ServiceHub,
  SatelliteServiceDef
} from '@watr/commlinks';

import { promisify } from 'util';
import { RestPortal, startRestWorker } from '~/http-servers/rest-portal/rest-worker';
import { DatabaseContext, insertNewUrlChains } from '~/db/db-api';
import { getDBConfig } from '~/db/database';
import { AlphaRecord } from '@watr/commonlib';

function getWorkingDir(): string {
  const appSharePath = process.env['APP_SHARE_PATH'];
  const workingDir = appSharePath ? appSharePath : 'app-share.d';
  return workingDir;
}

export type WorkflowServiceName = keyof {
  RestPortalService: null,
  UploadIngestor: null,
  Spider: null,
  FieldExtractor: null,
  FieldBundler: null,
  MockService: null,
}


export const WorkflowServiceNames: WorkflowServiceName[] = [
  'RestPortalService',
  'UploadIngestor',
  'Spider',
  'FieldExtractor',
  'FieldBundler',
  'MockService',
];


const RestPortalService = defineSatelliteService<RestPortal>(
  (commLink) => startRestWorker(commLink), {
  async shutdown() {
    this.log.debug(`${this.serviceName} [shutdown]> `)

    const { server } = this.cargo;
    const doClose = promisify(server.close).bind(server);
    return doClose().then(() => {
      this.log.debug(`${this.serviceName} [server:shutdown]> `)
    });
  }
});

interface UploadIngestorT {
  databaseContext: DatabaseContext,
}

const UploadIngestor = defineSatelliteService<UploadIngestorT>(
  async () => {
    const dbConfig = getDBConfig();
    if (dbConfig === undefined) {
      throw new Error('invalid database config; use env.{database,username,password}')
    }
    const databaseContext: DatabaseContext = { dbConfig };
    return {
      databaseContext
    };
  }, {
  async trace(): Promise<void> {
    this.log.info('[trace]> ');
  },

  async step(): Promise<void> {
    this.log.info('[step]> ')
    const { databaseContext } = this.cargo;
    await insertNewUrlChains(databaseContext)
  },

  async run(data: WorkflowData): Promise<WorkflowData> {
    const workingDir = getWorkingDir();
    this.log.info(`[run]> ${data.kind}; working dir = ${workingDir}`)

    const { alphaRec } = data;
    // if we have the data on disk, just return it
    const downloadDir = path.resolve(workingDir, 'downloads.d');

    // getExtractedField(downloadDir, alphaRec);
    return data;
  },
});

const Spider = defineSatelliteService<void>(
  async () => undefined, {
});
// const Spider = defineSatelliteService<SpiderService>(
//   async () => createSpiderService(getWorkingDir()), {
//   async step() {
//     this.log.info(`${this.serviceName} [step]> `)
//     const spider = this.cargo;
//     let nextUrl = await getNextUrlForSpidering();
//     while (nextUrl !== undefined) {
//       const metadata = await spider
//         .scrape(nextUrl)
//         .catch((error: Error) => {
//           putStrLn('Error', error.name, error.message);
//           return undefined;
//         });

//       if (metadata !== undefined) {
//         const committedMeta = await commitMetadata(metadata);
//         this.log.info(`committing Metadata ${committedMeta}`)
//         if (committedMeta) {
//           committedMeta.statusCode === 'http:200';
//           const corpusEntryStatus = await insertCorpusEntry(committedMeta.url);
//           this.log.info(`created new corpus entry ${corpusEntryStatus.entryId}: ${corpusEntryStatus.statusCode}`)
//           // await this.commLink.echoBack('step');
//         }
//       } else {
//         putStrLn(`Metadata is undefined for url ${nextUrl}`);
//       }
//       nextUrl = await getNextUrlForSpidering();
//     }
//   },
//   async shutdown() {
//     this.log.debug(`${this.serviceName} [shutdown]> `)
//     const spider = this.cargo;
//     return spider.scraper.quit()
//       .then(() => {
//         this.log.debug(`${this.serviceName} [scraper:shutdown]> `)
//       });
//   }
//   });

const registeredServices: Partial<Record<WorkflowServiceName, SatelliteServiceDef<any>>> = {
  RestPortalService,
  UploadIngestor,
  Spider,
  'FieldExtractor': defineSatelliteService<void>(
    async () => undefined, {
  }),

  'FieldBundler': defineSatelliteService<void>(
    async () => undefined, {
  }),
};

export async function runServiceHub(
  hubName: string,
  orderedServices: string[]
): Promise<[ServiceHub, () => Promise<void>]> {
  return createHubService(hubName, orderedServices);
}

export async function runRegisteredService(
  hubName: string,
  serviceName: WorkflowServiceName,
): Promise<SatelliteService<any>> {
  const serviceDef = registeredServices[serviceName]
  return createSatelliteService(hubName, serviceName, serviceDef);
}

export async function runServiceHubAndSatellites(
  hubName: string,
  satelliteServiceDefs: Record<string, SatelliteServiceDef<any>>
): Promise<[ServiceHub, () => Promise<void>, Record<string, SatelliteService<any>>]> {

  const serviceNames = _.keys(satelliteServiceDefs);

  const [hubService, hubConnected] = await createHubService(hubName, serviceNames);
  const servicePromises = _.map(serviceNames, (serviceName) => {
    return createSatelliteService(hubName, serviceName, satelliteServiceDefs[serviceName]);
  });

  const satellites: Array<[string, SatelliteService<any>]> = await Promise.all(servicePromises)
    .then((satellites) => _.map(satellites, s => [s.serviceName, s]));

  const satelliteRecords = _.fromPairs(satellites);

  return [hubService, hubConnected, satelliteRecords];
}

export interface RecordRequest {
  kind: 'record-request';
  alphaRec: AlphaRecord;
}
// export const RecordRequest =
//   (alphaRec: AlphaRecord): RecordRequest => ({
//     kind: 'record-request',
//     alphaRec
//   });

// export interface FieldResponse {
//   kind: 'field-response';
//   alphaRec: AlphaRecord;
// }

export type WorkflowData =
  RecordRequest
  ;


// function getWorkingDir(): string {
//   const appSharePath = process.env['APP_SHARE_PATH'];
//   const workingDir = appSharePath ? appSharePath : 'app-share.d';
//   return workingDir;
// }

// const registeredServices: Record<WorkflowServiceName, SatelliteServiceDef<any>> = {


//   'Spider': defineSatelliteService<SpiderService>(
//     async () => createSpiderService(getWorkingDir()), {
//     async run(data: WorkflowData): Promise<WorkflowData> {
//       this.log.info(`[run]> ${data.kind}`)
//       const { alphaRec } = data;
//       const spider = this.cargo;
//       const nextUrl = alphaRec.url;

//       const metadata = await spider
//         .scrape(nextUrl)
//         .catch((error: Error) => {
//           putStrLn('Error', error.name, error.message);
//           return undefined;
//         });

//       // return metadata;

//       return data;
//     },

//     async shutdown() {
//       this.log.debug(`${this.serviceName} [shutdown]> `)
//       const spider = this.cargo;
//       return spider.scraper.quit()
//         .then(() => {
//           this.log.debug(`${this.serviceName} [scraper:shutdown]> `)
//         });
//     }
//   }),


//   'FieldExtractor': defineSatelliteService<void>(
//     async () => undefined, {
//     async run(data: WorkflowData): Promise<WorkflowData> {
//       this.log.info(`[run]> ${data.kind}`)
//       const { alphaRec } = data;
//       const { url } = alphaRec;

//       const workingDir = getWorkingDir();
//       const corpusRoot = path.resolve(workingDir, 'downloads.d');
//       const entryEncPath = makeHashEncodedPath(url, 3);
//       const entryPath = entryEncPath.toPath();
//       const entryFullpath = path.resolve(corpusRoot, entryPath);
//       await extractFieldsForEntry(entryFullpath, this.log)
//       return data;
//     },
//   }),

//   'FieldBundler': defineSatelliteService<void>(
//     async () => undefined, {
//     async run(data: WorkflowData): Promise<WorkflowData> {
//       this.log.info(`[run]> ${data.kind}`)

//       const workingDir = getWorkingDir();
//       const corpusRoot = path.resolve(workingDir, 'downloads.d');

//       this.log.info(`[run]> ${data.kind}; working dir = ${corpusRoot}`)

//       const { alphaRec } = data;
//       // if we have the data on disk, just return it
//       getExtractedField(corpusRoot, alphaRec);

//       return data;
//     },
//   }),
// };
