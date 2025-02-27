import _ from 'lodash';
import path from 'path';
import fs from 'fs-extra';

import { getConsoleAndFileLogger, setLogLabel, setLogLevel } from './basic-logging';

describe('Logging', () => {
  const tmpdir = './test.tmp.d';
  const logname = 'test.log';
  const logpath = path.resolve(tmpdir, logname);
  // const logfile = path.resolve(tmpdir, `${logpath}.pretty.txt`);


  beforeEach(() => {
    if (fs.existsSync(tmpdir)) {
      fs.emptyDirSync(tmpdir);
      fs.rmdirSync(tmpdir);
    }
    fs.mkdirpSync(tmpdir);
  });

  it('should create console/file loggers with common namespace prefixes', () => {
    const log = getConsoleAndFileLogger(logpath);

    setLogLabel(log, '/foo/bar');

    log.info('hello, world!');
    setLogLevel(log, 'console', 'debug');
    log.debug('debug, world!');
    setLogLevel(log, 'console', 'silly');
    log.silly('silly, world!');
    setLogLevel(log, 'console', 'debug');
    log.silly('silly, world 2!');

    setLogLevel(log, 'file', 'info');
    setLogLabel(log, '/baz/crux');

    log.info('goodbye, planet!');
    log.debug('debug, world!');
    log.silly('silly, world!');
  });

  it('should create child loggers', () => {
    const log = getConsoleAndFileLogger(logpath);

    setLogLabel(log, '/foo/bar');
    log.info('foobar!');

    const childlog = log.child({});
    setLogLabel(childlog, 'childLabel');

    log.info('foobar/baz');
    childlog.info('child:bar/baz');
  });
});
