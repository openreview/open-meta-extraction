import { putStrLn } from '@watr/commonlib';
import { registerAllClis, runCli } from './runner';

import 'source-map-support/register';

(async () => {
  registerAllClis();
  await runCli()
    .then(()  => {
      putStrLn(`Exiting process`);
      process.exit(0);
    })
    .catch(error => {
      putStrLn(`Error: exiting process`);
      process.exit(1);
    });
})().catch(error => {
  putStrLn(`Error: exiting process`);
  process.exit(1);
});
