import _ from 'lodash';
import { findAncestorFile, initConfig } from './config';
import { prettyFormat, prettyPrint } from '..';

describe('Configuration Management', () => {
  type ExampleT = Parameters<typeof findAncestorFile>;
  it('find ancestor file', () => {

    const examplesUndef: ExampleT[] = [
      ['.', 'foobar', ['conf', '.']],
      ['no/path', 'foobar', ['conf', '.']],
    ];

    const examplesDef: ExampleT[] = [
      ['..', 'tsconfig.json', ['conf', '.']],
      ['.', 'jest.setup.ts', ['test', '.']],
    ];

    _.each(examplesUndef, ex => {
      const result = findAncestorFile(...ex);
      expect(result).toBeUndefined();
    });
    _.each(examplesDef, ex => {
      const result = findAncestorFile(...ex);
      expect(result).toBeDefined();
    });

  });

  it('read base config+secrets', () => {
    process.env['workingDirectory'] = './test.tmp.d';
    // const conf = configureApp();
    // const conf = initConfig();
    // const api = conf.get('openreview:restApi');
    // const pass = conf.get('openreview:restPassword');
    // prettyPrint({ api, pass });
  });

  it('should allow overrides at runtime', () => {
    const conf = initConfig();
    const conf0Port = conf.get('openreview:port');
    conf.set('openreview:port', 0);
    const conf1Port = conf.get('openreview:port');
    const conf2 = initConfig();
    const conf12Port = conf.get('openreview:port');
    const conf2Port = conf2.get('openreview:port');
    prettyPrint({ conf0Port, conf1Port, conf2Port, conf12Port })
  });
});
