import _ from 'lodash';
import { findAncestorFile, loadConfig } from './config';
import { prettyFormat, prettyPrint } from '..';

describe('Configuration Management', () => {
  type ExampleT = Parameters<typeof findAncestorFile>;
  it.skip('find ancestor file', () => {

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


  it('should allow independent configs', () => {
    const conf = loadConfig();
    const conf0Port = conf.get('openreview:port');
    conf.set('openreview:port', 0);
    const conf1Port = conf.get('openreview:port');
    const conf2 = loadConfig();
    const conf12Port = conf.get('openreview:port');
    const conf2Port = conf2.get('openreview:port');
    prettyPrint({ msg: 'loadConfig()', conf0Port, conf1Port, conf2Port, conf12Port })
  });

});
