import _ from 'lodash';
import * as m from './mock-scopes';
import { withScopedExec, composeScopes } from './scoped-exec';
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

    const exec_2_3 = composeScopes(
      m.secondaryExec(),
      m.tertiaryExec()
    );
    const primary = new m.Primary({});
    for await (const {} of exec_2_3({ primary })) {}

    const exec_1_2_3 = composeScopes(
      exec_1_2,
      m.tertiaryExec()
    );

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
