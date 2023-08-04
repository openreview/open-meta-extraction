import { getServiceLogger, prettyPrint } from '@watr/commonlib';
import workerThreads, { parentPort } from 'worker_threads';
import process from 'process';
import path from 'path';



function exitJob() {
  const { parentPort } = workerThreads;
  if (parentPort) parentPort.postMessage('done');
  else process.exit(0);
}

function getWorkerData(): any {
  const { workerData } = workerThreads;
  return workerData;
}

type JobLogger = (msg: string) => void;

function getJobLogger(jobFilename: string): JobLogger {
  const infoLogger = getServiceLogger(`job:${jobFilename}`).info;

  function jobLogger(msg: string): void {
    const { threadId, isMainThread } = workerThreads;
    const d = new Date();

    const localTime = d.toLocaleTimeString();
    const threadStr = isMainThread ? 't#main' : `t#${threadId}`;
    if (parentPort !== null) {
      parentPort.postMessage(`${localTime} [job:${jobFilename}:${threadStr}] - ${msg}`);
      return;
    }
    infoLogger(msg);
  }

  return jobLogger;
}

export async function runJob(
  jobFilename: string,
  jobFunc: (logger: JobLogger, workerData: any) => void | Promise<void>
): Promise<void> {
  const baseName = path.basename(jobFilename);
  const baseNoExt = baseName.slice(0, Math.max(0, baseName.length - 3));
  const log: JobLogger = getJobLogger(baseNoExt);

  const workerData = getWorkerData();

  log(`JobBegin:${baseNoExt}`);

  await Promise.resolve(jobFunc(log, workerData));

  log(`JobDone '${baseNoExt}'`);
  exitJob();
}
