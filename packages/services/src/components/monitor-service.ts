import _ from 'lodash';

import { getServiceLogger, oneHour } from '@watr/commonlib';
import { UseMongooseArgs, WithMongoose, useMongoose } from '~/db/mongodb';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { ExtractionServiceMonitor, extractionServiceMonitor } from './extraction-service';
import { FetchServiceMonitor, fetchServiceMonitor } from './fetch-service';
import { Router, respondWithPlainText, useHttpServer } from '@watr/spider';
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
};

export class MonitorService {
  log: Logger;
  mongoose: Mongoose;
  sendNotifications: boolean;

  monitorUpdateInterval = oneHour;
  monitorNotificationInterval = oneHour * 12;
  lastSummary: MonitorSummaries | undefined;

  constructor({
    sendNotifications,
    mongoose,
  }: MonitorServiceArgs) {
    this.log = getServiceLogger('MonitorService');
    this.mongoose = mongoose;
    this.sendNotifications = sendNotifications
  }

  async collectMonitorSummaries(): Promise<MonitorSummaries | undefined> {
    const extractionSummary = await extractionServiceMonitor();
    const fetchSummary = await fetchServiceMonitor();
    return { extractionSummary, fetchSummary, lastUpdateTime: new Date() };
  }

  async updateSummary() {
    this.lastSummary = await this.collectMonitorSummaries();
  }

  async scheduleMonitorUpdates() {
    await this.updateSummary();
    setInterval(this.updateSummary, this.monitorUpdateInterval);
  }
  async scheduleNotifications() {
    setInterval(this.notify, this.monitorNotificationInterval);
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

  async runServer(port: number) {
    const self = this;
    this.scheduleMonitorUpdates();
    function monitorServiceRoutes(r: Router) {
      const summary = formatMonitorSummaries(self.lastSummary);
      r.get('/monitor/status', respondWithPlainText(summary));
    }

    for await (const { keepAlive } of useHttpServer({ setup: monitorServiceRoutes, port })) {
      this.scheduleNotifications();
      await keepAlive;
    }
  }

  async notify() {
    this.log.info('Starting Notifications');
    await this.updateSummary();
    const summary = formatMonitorSummaries(this.lastSummary);
    if (this.sendNotifications) {
      this.log.info('Sending Notifications');
      await this.postNotifications(summary);
      return;
    }
    this.log.info('No notifications sent');
    const subject = 'OpenReview Extraction Service Status';
    this.log.info(subject);
    this.log.info(summary);
  }
}

export type WithMonitorService = WithMongoose & {
  monitorService: MonitorService
}

type UseMonitorServiceArgs = UseMongooseArgs & MonitorServiceArgs;


export async function* useMonitorService(args: UseMonitorServiceArgs): AsyncGenerator<WithMonitorService, void, any> {
  for await (const components of useMongoose(args)) {
    const { sendNotifications } = args;
    const { mongoose } = components;
    const monitorService = new MonitorService({
      mongoose,
      sendNotifications,
    });
    const toYield = _.merge({}, { monitorService }, args);
    yield toYield;
  }
}


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
