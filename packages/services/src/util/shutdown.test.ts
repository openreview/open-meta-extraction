import { prettyPrint, putStrLn } from "@watr/commonlib";
import { useGracefulExit } from "./shutdown";

describe('Graceful Exit', () => {


  it('should ...', async () => {
    const echo = async () => { putStrLn('Async: Echo Handled!') };
    const echo2 = () => { putStrLn('Sync: Echo Handled!') };

    for await (const { gracefulExit } of useGracefulExit()) {
      gracefulExit.addHandler(echo);
      gracefulExit.addHandler(echo2);
      prettyPrint({
        handlers: gracefulExit.handlers
      })
    }


  });
});
