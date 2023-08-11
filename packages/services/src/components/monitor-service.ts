import _ from 'lodash';

import { getServiceLogger, withScopedResource, putStrLn, combineScopedResources, ConfigProvider } from '@watr/commonlib';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { ExtractionServiceMonitor, extractionServiceMonitor } from './extraction-service';
import { FetchServiceMonitor, fetchServiceMonitor } from './fetch-service';
import { Router, respondWithPlainText, scopedHttpServerWithDeps } from '@watr/spider';
import { Logger } from 'winston';
import { CountPerDay } from '~/db/mongo-helpers';
import { Mongoose } from 'mongoose';
import { scopedMongooseWithDeps } from '~/db/mongodb';


type MonitorSummaries = {
  lastUpdateTime: Date,
  extractionSummary: ExtractionServiceMonitor,
  fetchSummary: FetchServiceMonitor,
}

type MonitorServiceArgs = {
  mongoose: Mongoose,
  sendNotifications: boolean,
  monitorUpdateInterval: number,
  monitorNotificationInterval: number,
  config: ConfigProvider
};

export class MonitorService {
  log: Logger;
  mongoose: Mongoose;
  sendNotifications: boolean;

  monitorUpdateInterval: number;
  monitorNotificationInterval: number;
  lastSummary: MonitorSummaries | undefined;
  config: ConfigProvider;

  constructor({
    sendNotifications,
    mongoose,
    monitorUpdateInterval,
    monitorNotificationInterval,
    config
  }: MonitorServiceArgs) {
    this.log = getServiceLogger('MonitorService');
    this.mongoose = mongoose;
    this.sendNotifications = sendNotifications
    this.monitorUpdateInterval = monitorUpdateInterval;
    this.monitorNotificationInterval = monitorNotificationInterval;
    this.config = config;
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
      r.get('/monitor/status', (ctx) => {
        const summary = formatMonitorSummaries(self.lastSummary);
        respondWithPlainText(summary)(ctx);
      });
    }

    for await (const { httpServer } of scopedHttpServerWithDeps()({ port, routerSetup })) {
      this.log.info('Server is live');
      await httpServer.keepAlive();
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
    const gateway = new OpenReviewGateway(this.config);
    const subject = 'OpenReview Extraction Service Status';
    this.log.info('Email:');
    this.log.info(`  subject: ${subject}`);
    this.log.info(message);
    this.log.info('Sending Email Notification');
    await gateway.postStatusMessage(subject, message);
  }
}


export const scopedMonitorService = () => withScopedResource<
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

export const scopedMonitorServiceWithDeps = () => combineScopedResources(
  scopedMongooseWithDeps(),
  scopedMonitorService()
);

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
