import { getServiceLogger, isTestingEnv, prettyPrint } from '@watr/commonlib';
import { formatStatusMessages, showStatusSummary } from '~/db/extraction-summary';
import { connectToMongoDB, useMongoose } from '~/db/mongodb';
import { OpenReviewGateway } from '~/components/openreview-gateway';
import { extractionServiceMonitor } from './extraction-service';
import { fetchServiceMonitor } from './fetch-service';


type Args = {
  sendNotification: boolean,
};

export async function runMonitor({
  sendNotification
}: Args) {

  const log = getServiceLogger('MonitorService');
  log.info('Running Monitor');
  for await (const {} of useMongoose({})) {
    // const summaryMessages = await showStatusSummary();
    // const formattedSummary = formatStatusMessages(summaryMessages);
    const extractionSummary = await extractionServiceMonitor();
    const fetchSummary = await fetchServiceMonitor();
    prettyPrint({ extractionSummary, fetchSummary })

    // const gateway = new OpenReviewGateway();
    // const subject = 'OpenReview Extraction Service Status';
    // const message = formattedSummary;
    // log.info('Email:');
    // log.info(`  subject: ${subject}`);
    // log.info(message);
    // const shouldPost = sendNotification && !isTestingEnv();
    // if (shouldPost) {
    //   log.info('Sending Email Notification');
    //   await gateway.postStatusMessage(subject, message);
    //   return;
    // }
    // log.warn('No monitor notification sent');
  }

}
