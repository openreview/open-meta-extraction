import { arglib, prettyPrint, putStrLn } from '@watr/commonlib';

import { spiderCLI } from '@watr/spider';
import * as workflowCmds from './commands';

export function registerAllClis() {
  workflowCmds.registerCLICommands(arglib.YArgs);
  spiderCLI.registerCommands(arglib.YArgs);
}

export async function runCli() {
  const runResult = arglib.YArgs
    .demandCommand(1, 'You need at least one command before moving on')
    .strict()
    .help()
    .fail((msg, err) => {
      let errorMessage = `Error:
      ${msg}
      `;

      if (err instanceof Error) {
        const stack = err.stack;
        const cause = err.cause;
        const { name, message} = err;
        prettyPrint({ name, message, cause, stack });
      }

      if (err !== undefined) {
        errorMessage += `
          Error was: ${err.toString()}
        `;
      }

      putStrLn(errorMessage);
      arglib.YArgs.showHelp();
      process.exit(1);
    })
    .argv;

  return runResult;
}
