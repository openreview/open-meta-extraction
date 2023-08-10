import _ from 'lodash';
import path from 'path';

import * as winston from 'winston';

import {
  createLogger,
  transports,
  format,
  Logger,
  config,
} from 'winston';

const { cli } = config;

export const AllLogLevels = [
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly',
];

// import * as Transport from 'winston-transport';

import { parentPort, threadId } from 'worker_threads';
import { putStrLn } from './pretty-print';

export class ParentPortTransport2 extends transports.Console {
  constructor(opts: any) {
    super(opts);
  }
  log(msg: any, done: () => void) {
    if (parentPort !== null) {
      putStrLn(`postMessage from child>..`);
      // parentPort.postMessage(`from child> ${msg}`);
      const { message, level, timestamp } = msg;
      const logmessage = `${timestamp} worker:${threadId} ${level} ${message}`;
      parentPort.postMessage(logmessage);
    }
    // done();
  }
}


export function setLogEnvLevel(level: string): void {
  process.env['app.loglevel'] = level;
}

export function getLogEnvLevel(): string {
  const envLogLevel = process.env['app.loglevel'];
  const envLevel = envLogLevel;

  switch (envLevel) {
    case 'error':
    case 'warn':
    case 'info':
    case 'http':
    case 'verbose':
    case 'debug':
    case 'silly':
      return envLevel;
  }
  return 'debug';
}

export function getServiceLogger(label: string): Logger {
  const { cli } = config;

  let logLevel = getLogEnvLevel();
  const level = logLevel || 'debug';
  const ppt = new ParentPortTransport2({
    format: format.combine(
      format.colorize(),
      format.timestamp({
        format: 'HH:mm:ss:sss'
      }),
      format.label({ label, message: true }),
      format.printf(info => `(child) ${info.timestamp} ${info.level} ${info.message}`)
    ),
  });

  const logger = createLogger({
    level,
    levels: cli.levels,
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.timestamp({
            format: 'HH:mm:ss:sss'
          }),
          format.label({ label, message: true }),
          // format.simple(),
          format.printf(info => `${info.timestamp} ${info.level} ${info.message}`)
        ),
      }),
      // ppt
    ],
  });

  if (logLevel === undefined) {
    logger.warn(`log level could not be deduced from env variables, setting to ${level}`);
  }

  return logger;
}

export type TransportType = 'file' | 'console';

export function setLogLabel(log: Logger, label: string) {
  // setLogLabels(log, label);
  log.format = format.combine(
    format.label({ label, message: true })
  );
}

export function setLogLabels(log: Logger, label: string) {
  _.each(
    log.transports, t => {
      t.format = format.combine(
        format.colorize(),
        format.label({ label, message: true }),
        format.simple(),
      );
    }
  );
}

export function setLogLevel(log: Logger, transportType: TransportType, level: string) {
  _.each(
    log.transports, t => {
      const setLevel =
        ((transportType === 'file') && (t instanceof transports.File))
        || ((transportType === 'console') && (t instanceof transports.Console))
        ;

      if (setLevel) {
        t.level = level;
      }
    }
  );
}

export function newConsoleTransport(level: string): transports.ConsoleTransportInstance {
  return new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
    ),
    level
  });
}

export function newLogger(...transports: winston.transport[]): Logger {
  return createLogger({
    levels: cli.levels,
    transports,
  });
}

export function newFileTransport(dirname: string, filename: string, level: string): transports.FileTransportInstance {
  return new transports.File({
    filename,
    level,
    format: format.combine(
      format.timestamp(),
      format.json()
    ),
    dirname,
    tailable: true,
  });
}

export function getConsoleAndFileLogger(
  logfilePath: string,
  level: string = 'info',
): Logger {
  const rootLoggingPath = path.dirname(logfilePath);
  const logfile = path.basename(logfilePath);

  const consoleTransport = newConsoleTransport(level);

  const fileTransport = newFileTransport(rootLoggingPath, logfile, level);

  const logger = createLogger({
    levels: config.cli.levels,
    transports: [
      consoleTransport,
      fileTransport
    ],
  });
  return logger;
}
