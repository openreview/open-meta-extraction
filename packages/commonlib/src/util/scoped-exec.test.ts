import _ from 'lodash';
import * as m from './mock-scopes';
import { composeScopes, Yielded } from './scoped-exec';

describe('Scoped Execution', () => {
  it('compose composeNScopes properly', async () => {
    const reqString = 'dude...';
    const reqBool = true;
    const reqNumber = 42;

    const comp1 = composeScopes(
      m.loggerExec(),
      m.alphaExec(),
      m.betaExec(),
      m.gammaExec(),
      m.gammaExec(),
      m.betaExec(),
      m.alphaExec(),
    );

    const logBuffer1: string[] = [];
    for await (const {} of comp1({ logBuffer: logBuffer1, reqString, reqBool, reqNumber })) {}

    expect(logBuffer1).toMatchObject([
      'alphaResource: init', 'alphaResource: construct',
      'betaResource: init', 'betaResource: construct',
      'gammaResource: init', 'gammaResource: construct',
      'gammaResource: init', 'gammaResource: construct',
      'betaResource: init', 'betaResource: construct',
      'alphaResource: init', 'alphaResource: construct',
      'alphaResource: destroy',
      'betaResource: destroy',
      'gammaResource: destroy',
      'gammaResource: destroy',
      'betaResource: destroy',
      'alphaResource: destroy'
    ]);
  });

  it('should composeScopes() properly', async () => {
    const logger = m.loggerExec();
    const alpha = m.alphaExec();
    const beta = m.betaExec();
    const gamma = m.gammaExec();

    const reqString = 'dude...';
    const reqBool = true;
    const reqNumber = 42;

    const logAlpha = composeScopes(logger, alpha);
    const alphaBeta = composeScopes(logAlpha, beta)
    const alphaBetaGamma = composeScopes(alphaBeta, gamma);
    const logBuffer1: string[] = [];

    for await (const {} of alphaBetaGamma({ logBuffer: logBuffer1, reqString, reqBool, reqNumber })) {
    }

    expect(logBuffer1).toMatchObject([
      'alphaResource: init',
      'alphaResource: construct',
      'betaResource: init',
      'betaResource: construct',
      'gammaResource: init',
      'gammaResource: construct',
      'gammaResource: destroy',
      'betaResource: destroy',
      'alphaResource: destroy'
    ]);

    const alphaBetaAlpha = composeScopes(alphaBetaGamma, alpha);

    try {
      const logBuffer2: string[] = [];
      for await (const {} of alphaBetaAlpha({ logBuffer: logBuffer2, reqString, reqBool, reqNumber })) {
      }
    } catch (error: unknown) {
      expect(error).toBeDefined();
    }
  });

  it('should type check composition', async () => {
    const exec_1_2 = composeScopes(
      m.primaryExec(),
      m.secondaryExec()
    );
    type R1_2 = Yielded<ReturnType<typeof exec_1_2>>;
    type P1_2 = Parameters<typeof exec_1_2>[0];

    const exec_2_3 = composeScopes(
      m.secondaryExec(),
      m.tertiaryExec()
    );
    type R2_3 = Yielded<ReturnType<typeof exec_2_3>>;
    type P2_3 = Parameters<typeof exec_2_3>[0];
    const primary = new m.Primary({});

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
  it('compose using nested generators', async () => {
    const logger = m.loggerExec();
    const alpha = m.alphaExec();
    const beta = m.betaExec();
    const gamma = m.gammaExec();

    const reqString = 'dude...';
    const reqBool = true;
    const reqNumber = 42;

    const logBuffer: string[] = [];

    for await (const { logRecorder } of logger({ logBuffer })) {
      for await (const { alphaResource } of alpha({ reqString, reqBool, logRecorder })) {
        for await (const { betaResource } of beta({ reqBool, reqNumber, logRecorder })) {
          for await (const {} of gamma({ alphaResource, betaResource, logRecorder })) {
          }
        }
      }
    }

    expect(logBuffer).toMatchObject([
      'alphaResource: init',
      'alphaResource: construct',
      'betaResource: init',
      'betaResource: construct',
      'gammaResource: init',
      'gammaResource: construct',
      'gammaResource: destroy',
      'betaResource: destroy',
      'alphaResource: destroy'
    ]);

  });
});
