import _ from 'lodash';
import * as m from './mock-scopes';
import { withScopedExec, composeScopes, Yielded } from './scoped-exec';
import { putStrLn } from './pretty-print';



describe('Scoped Execution', () => {
  it.only('should compose', async () => {
    const alpha = m.alphaExec();
    const beta = m.betaExec();
    const gamma = m.gammaExec();

    const reqString = 'dude...';
    const reqBool = true;
    const reqNumber = 42;

    const alphaBeta = composeScopes(alpha, beta)
    const alphaBetaGamma = composeScopes(alphaBeta, gamma);

    for await (const { betaResource, alphaResource, gammaResource } of alphaBetaGamma({ reqString, reqBool, reqNumber })) {
      putStrLn({ alphaResource, betaResource, gammaResource });
    }

    const alphaBetaAlpha = composeScopes(alphaBetaGamma, alpha);

    for await (const { betaResource, alphaResource } of alphaBetaAlpha({ reqString, reqBool, reqNumber })) {
      putStrLn({ alphaResource, betaResource });
    }

  });
  it.only('should concat composition', async () => {
    const exec_1_2 = composeScopes(
      m.primaryExec(),
      m.secondaryExec()
    );
    for await (const {} of exec_1_2({})) {}
    type R1_2 = Yielded<ReturnType<typeof exec_1_2>>;
    type P1_2 = Parameters<typeof exec_1_2>[0];

    const exec_2_3 = composeScopes(
      m.secondaryExec(),
      m.tertiaryExec()
    );
    type R2_3 = Yielded<ReturnType<typeof exec_2_3>>;
    type P2_3 = Parameters<typeof exec_2_3>[0];
    const primary = new m.Primary({});
    for await (const {} of exec_2_3({ primary })) {}

    const exec_1_2_3 = composeScopes(
      exec_1_2,
      m.tertiaryExec()
    );
    type R1_2_3 = Yielded<ReturnType<typeof exec_1_2_3>>;
    // Should be P2-R1 & P3-P2
    // Is currently P2-R1 & P3
    type P1_2_3 = Parameters<typeof exec_1_2_3>[0];

    for await (const {} of exec_1_2_3({})) {}

  });
  it('compose', async () => {
    const alpha = m.alphaExec();
    const beta = m.betaExec();
    const gamma = m.gammaExec();

    const reqString = 'dude...';
    const reqBool = true;
    const reqNumber = 42;

    for await (const { alphaResource } of alpha({ reqString, reqBool })) {
      for await (const { betaResource } of beta({ reqBool, reqNumber })) {
        for await (const { gammaResource } of gamma({ alphaResource, betaResource })) {
          putStrLn(`gamma= ${gammaResource}`);
          // yield { reqString, reqBool, reqNumber, alphaResource, betaResource, bammaResource }
        }
      }
    }
  });
});
