import { getServiceLogger, oneHour, prettyFormat, putStrLn } from '@watr/commonlib';
import { useMongoose } from '~/db/mongodb';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { ExtractionServiceMonitor, extractionServiceMonitor } from './extraction-service';
import { FetchServiceMonitor, fetchServiceMonitor } from './fetch-service';
import { Router, respondWithJson, respondWithPlainText, useHttpServer } from '@watr/spider';
import { Logger } from 'winston';
import { CountPerDay } from '~/db/mongo-helpers';


type Args = {
  startServer: boolean,
  sendNotification: boolean,
  port: number
};

export async function runMonitor({
  sendNotification,
  startServer,
  port
}: Args) {
  const log = getServiceLogger('MonitorService');
  const monitorUpdateInterval = oneHour;
  const monitorNotificationInterval = oneHour * 12;

  log.info('Running Monitor');
  let lastSummary = await collectMonitorSummaries();

  async function sendNotifications() {
    log.info('Starting Notifications');
    const summary = formatMonitorSummaries(lastSummary);
    if (sendNotification) {
      log.info('Sending Notifications');
      await sendNotificationFunc(log, summary);
      return;
    }
    log.info('No notifications sent');
    const subject = 'OpenReview Extraction Service Status';
    log.info(subject);
    log.info(summary);
  }

  if (startServer) {
    async function updateSummary() {
      lastSummary = await collectMonitorSummaries();
    }
    setInterval(updateSummary, monitorUpdateInterval);
    function monitorServiceRoutes(r: Router) {
      const summary = formatMonitorSummaries(lastSummary);
      r.get('/monitor/status', respondWithPlainText(summary));
    }

    for await (const { keepAlive } of useHttpServer({ setup: monitorServiceRoutes, port })) {
      const intervalObj = setInterval(sendNotifications, monitorNotificationInterval);
      await keepAlive;
      clearInterval(intervalObj);
    }
    return;
  }

  await sendNotifications();
}

type MonitorSummaries = {
  extractionSummary: ExtractionServiceMonitor,
  fetchSummary: FetchServiceMonitor
}

function formatMonitorSummaries(summaries?: MonitorSummaries): string {
  if (!summaries) {
    return 'Error: No Monitor Summary Available';
  }

  function fmtCountsPerDay(cpd: CountPerDay[]): string {
    return cpd.map((v) => `    ${v.day}: ${v.count}`).join('\n');
  }
  const message = `
New Abstracts Found:
${fmtCountsPerDay(summaries.extractionSummary.newAbstracts)}

New Pdf Links Found:
${fmtCountsPerDay(summaries.extractionSummary.newPdfLinks)}

New Notes Fetched From OpenReview:
${fmtCountsPerDay(summaries.fetchSummary.newNotesPerDay)}
`;
  return message;
}

async function collectMonitorSummaries(): Promise<MonitorSummaries| undefined> {
  for await (const {} of useMongoose({})) {
    const extractionSummary = await extractionServiceMonitor();
    const fetchSummary = await fetchServiceMonitor();
    return { extractionSummary, fetchSummary };
  }
  putStrLn('Error: No monitor summary available');
}

async function sendNotificationFunc(log: Logger, message: string) {
  const gateway = new OpenReviewGateway();
  const subject = 'OpenReview Extraction Service Status';
  log.info('Email:');
  log.info(`  subject: ${subject}`);
  log.info(message);
  log.info('Sending Email Notification');
  await gateway.postStatusMessage(subject, message);
}
