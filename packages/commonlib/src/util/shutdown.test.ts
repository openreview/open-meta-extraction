import { putStrLn } from "./pretty-print";
import { withScopedExec } from "./scoped-exec";
import { GracefulExit, gracefulExitExecScope  } from "./shutdown";
import { exec } from 'child_process';
import _ from 'lodash';

type PrimaryResourceNeeds = {
  gracefulExit: GracefulExit,
}
class PrimaryResource {
  gracefulExit: GracefulExit;
  isClosed: boolean;
  constructor(g: GracefulExit) {
    this.gracefulExit = g;
    this.isClosed = false;
    putStrLn('new PrimaryResource()');
  }
  async close() {
    putStrLn('primaryResource.close()')
    if (this.isClosed) throw new Error('already closed');
    this.isClosed = true;
  }
}

const scopedPrimary = () => withScopedExec<PrimaryResource, 'primaryResource', PrimaryResourceNeeds>(
  ({ gracefulExit }) => {
    const primaryResource = new PrimaryResource(gracefulExit);
    return { primaryResource }
  },
  async ({ primaryResource }) => {
    await primaryResource.close();
  }
);

describe('Graceful Exit', () => {

  it('should run exit handlers when resource out of scope', async () => {
    const echo = (m: string) => async () => { putStrLn(`Echo: ${m}`) };

    for await (const { gracefulExit } of gracefulExitExecScope()({})) {
      gracefulExit.addHandler(echo('inside graceful'));
      for await (const { primaryResource } of scopedPrimary()({ gracefulExit })) {
        gracefulExit.addHandler(echo('inside primary'));
        gracefulExit.addHandler(() => primaryResource.close());
      }
    }
  });

  it('should run exit handlers on process kill', async () => {
    for (const i in _.range(10)) {
      exec(
        `node ./dist/test/fixtures/kill-process.js ${i}`,
        { shell: '/bin/bash' },
        function (err, stdout) {
          const output = stdout.toString()
          const lines = output.split('\n')
          const isClosed = lines.some(l => /OK: closed/.test(l));
          const hasError = lines.some(l => /ERROR: already closed/.test(l));
          if (hasError) {
            putStrLn('Error:');
            putStrLn(lines);
            putStrLn('\n\n');
          }
          // const neverOpened =
          // putStrLn('Correct:');
          putStrLn(lines);
          putStrLn('\n\n');
          // expect(isClosed && !hasError).toBeTruthy();
        }
      );

    }
  });
  // it('should not run exit handler if already run on out-of-scope', async () => {
});
