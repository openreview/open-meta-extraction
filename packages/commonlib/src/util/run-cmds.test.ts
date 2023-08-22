import _ from 'lodash';
import path from 'path';

import { runFileCmd, runTidyCmd, runTidyCmdBuffered } from './shell-commands';
import { throughFunc } from './stream-utils';

describe('run command-line utils', () => {
  const testDirPath = './test/resources/htmls';

  it('should run Html5 Tidy to re-write htmls', async () => {
    const htmlFile = path.resolve(testDirPath, 'nospace.html');

    const { outStream, completePromise } = runTidyCmd(htmlFile);

    const lines: string[] = [];

    outStream
      .pipe(throughFunc(
        (line: string, _onerr?: (e: any) => void) => {
          lines.push(line);
        }))
      .on('data', () => {});

    await completePromise;

    const lines4 = lines.slice(0, 4);

    const padLeftLens = _.map(lines4, l => {
      const m = l.match(/^[ ]*/g);
      if (m === null) return -1;
      return m[0].length;
    });
    // console.log({ lines4  })
    expect(padLeftLens).toStrictEqual([0, 0, 4, 8]);
  });

  it('should get file types using file cmd', async () => {
    const htmlFile = path.resolve(testDirPath, 'nospace.html');

    const fileType = await runFileCmd(htmlFile);
    expect(fileType).toBe('text/html; charset=utf-8');
  });

  it('should handle process err output', async () => {
    const htmlFile = path.resolve(testDirPath, 'nospace.html');

    const [,out,] = await runTidyCmdBuffered(htmlFile);

    const lines4 = out.slice(0, 4);
    const padLeftLens = _.map(lines4, l => {
      const m = l.match(/^[ ]*/g);
      if (m === null) return -1;
      return m[0].length;
    });
    expect(padLeftLens).toStrictEqual([0, 0, 4, 8]);
  });

});
