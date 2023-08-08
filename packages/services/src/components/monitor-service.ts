import _ from 'lodash';

import { getServiceLogger, makeScopedResource, putStrLn, scopedGracefulExit } from '@watr/commonlib';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { ExtractionServiceMonitor, extractionServiceMonitor } from './extraction-service';
import { FetchServiceMonitor, fetchServiceMonitor } from './fetch-service';
import { Router, respondWithPlainText, scopedHttpServer } from '@watr/spider';
import { Logger } from 'winston';
import { CountPerDay } from '~/db/mongo-helpers';
import { Mongoose } from 'mongoose';


type MonitorSummaries = {
  lastUpdateTime: Date,
  extractionSummary: ExtractionServiceMonitor,
  fetchSummary: FetchServiceMonitor
}

type MonitorServiceArgs = {
  mongoose: Mongoose,
  sendNotifications: boolean,
  monitorUpdateInterval: number,
  monitorNotificationInterval: number
};

export class MonitorService {
  log: Logger;
  mongoose: Mongoose;
  sendNotifications: boolean;

  monitorUpdateInterval: number;
  monitorNotificationInterval: number;
  lastSummary: MonitorSummaries | undefined;

  constructor({
    sendNotifications,
    mongoose,
    monitorUpdateInterval,
    monitorNotificationInterval
  }: MonitorServiceArgs) {
    this.log = getServiceLogger('MonitorService');
    this.mongoose = mongoose;
    this.sendNotifications = sendNotifications
    this.monitorUpdateInterval = monitorUpdateInterval;
    this.monitorNotificationInterval = monitorNotificationInterval;
  }

  async collectMonitorSummaries(): Promise<MonitorSummaries | undefined> {
    const extractionSummary = await extractionServiceMonitor();
    const fetchSummary = await fetchServiceMonitor();
    return { extractionSummary, fetchSummary, lastUpdateTime: new Date() };
  }

  async updateSummary(): Promise<MonitorSummaries | undefined> {
    this.log.info('Updating Monitor Summaries')
    this.lastSummary = await this.collectMonitorSummaries();
    putStrLn('Summary is');
    putStrLn(this.lastSummary);
    putStrLn('/Summary');
    return this.lastSummary;
  }

  async runServer(port: number) {
    const self = this;
    this.log.info('Starting Monitor Service');

    await this.updateSummary();

    const updateFn = _.bind(this.updateSummary, this)
    const notifyFn = _.bind(this.notify, this)

    const updateInterval = setInterval(updateFn, this.monitorUpdateInterval);
    const notifyInterval = setInterval(notifyFn, this.monitorNotificationInterval);

    this.log.info('Update and Notification timers set');

    function routerSetup(r: Router) {
      const summary = formatMonitorSummaries(self.lastSummary);
      r.get('/monitor/status', respondWithPlainText(summary));
    }
    for await (const { gracefulExit } of scopedGracefulExit.use({})) {
      for await (const {httpServer} of scopedHttpServer.use({ gracefulExit, port, routerSetup })) {
        this.log.info('Server is live');
        await httpServer.keepAlive();
      }
    }

    this.log.info('Clearing update/notify timers');
    clearInterval(updateInterval);
    clearInterval(notifyInterval);
  }

  async notify() {
    this.log.info('Starting Notifications');
    const summary = formatMonitorSummaries(this.lastSummary);
    if (this.sendNotifications) {
      this.log.info('Sending Notifications');
      await this.postNotifications(summary);
      return;
    }
    this.log.info('No notifications sent');
    const subject = 'OpenReview Extraction Service Status';
    this.log.info(`Subject> ${subject}`);
    this.log.info(summary);
    this.log.info('/notify');
  }

  async postNotifications(message: string) {
    const gateway = new OpenReviewGateway();
    const subject = 'OpenReview Extraction Service Status';
    this.log.info('Email:');
    this.log.info(`  subject: ${subject}`);
    this.log.info(message);
    this.log.info('Sending Email Notification');
    await gateway.postStatusMessage(subject, message);
  }
}


export const scopedMonitorService = makeScopedResource<
  MonitorService,
  'monitorService',
  MonitorServiceArgs
>(
  'monitorService',
  async function init(args) {
    const monitorService = new MonitorService(args);
    return { monitorService };
  },
  async function destroy() {

  },
);

// export type WithMonitorService = WithMongoose & {
//   monitorService: MonitorService
// }

// type UseMonitorServiceArgs = UseMongooseArgs & MonitorServiceArgs;

// export async function* useMonitorService(args: UseMonitorServiceArgs): AsyncGenerator<WithMonitorService, void, any> {
//   const { mongoose } = args;
//   const monitorService = new MonitorService(_.merge({}, args, { mongoose }));
//   const toYield = _.merge({}, { monitorService }, args);
//   yield toYield;
// }


function formatMonitorSummaries(summaries?: MonitorSummaries): string {
  if (!summaries) {
    return 'Error: No Monitor Summary Available';
  }

  function fmtCountsPerDay(cpd: CountPerDay[]): string {
    return cpd.map((v) => `    ${v.day}: ${v.count}`).join('\n');
  }
  const message = `
Daily Activity

  New Abstracts Found:
${fmtCountsPerDay(summaries.extractionSummary.newAbstracts)}

  New Pdf Links Found:
${fmtCountsPerDay(summaries.extractionSummary.newPdfLinks)}

  New Notes Fetched From OpenReview:
${fmtCountsPerDay(summaries.fetchSummary.newNotesPerDay)}

Monitor Last Updated at ${summaries.lastUpdateTime.toTimeString()}
Updates occur once/hour.
`;
  return message;
}
