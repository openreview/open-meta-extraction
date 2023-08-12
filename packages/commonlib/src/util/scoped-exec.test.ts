
import _ from 'lodash';
import { $MaybeDiff, $Diff, AsObject, SymmetricDifference, $Keys } from "./utility-types";
import * as m from './mock-scopes';
import { withNewScopedExec } from './scoped-exec';
import { putStrLn } from './pretty-print';

type Gener<T> = AsyncGenerator<T, void, any>;
type Yielded<G> = G extends Gener<infer T> ? T : never;

type GenFunc<T> = T extends ((arg: infer A) => Gener<infer R>) ? (a: A) => Gener<R> : never;

type GenYielded<T> = T extends ((arg: any) => Gener<infer R>) ? R : never;
type GenParam<T> = T extends ((arg: infer A) => Gener<unknown>) ? A : never;

type UnpackFunc<T> = T extends (arg: infer A) => Gener<infer R> ?
  R extends A ? (a: A) => R : never : never;

export function compose<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  R1 extends object,
  R2 extends object
>(
  ab: (an: ANeeds) => Gener<R1>,
  bc: (bn: BNeeds) => Gener<R2>,
): (
  // needs: GenParam<typeof ab> & GenParam<typeof bc>// - yieldtype of ab $MaybeDiff<GenParam<typeof bc>, Yielded<ReturnType<typeof ab>>>
  needs: GenParam<typeof ab> & $MaybeDiff<GenParam<typeof bc>, Yielded<ReturnType<typeof ab>>>
) => Gener<
  Yielded<ReturnType<typeof ab>> & Yielded<ReturnType<typeof bc>>
> {

  async function* composition(
    // needs: GenParam<typeof ab> & GenParam<typeof bc>
    needs: GenParam<typeof ab> & $MaybeDiff<GenParam<typeof bc>, Yielded<ReturnType<typeof ab>>>
  ): Gener<
    Yielded<ReturnType<typeof ab>> & Yielded<ReturnType<typeof bc>>
  > {
    for await (const aprod of ab(needs)) {
      const needs2: $MaybeDiff<GenParam<typeof bc>, Yielded<ReturnType<typeof ab>>> = needs;
      const bcNeeds = _.merge({}, needs2, aprod) as any;
      for await (const bprod of bc(bcNeeds)) {
        const abcScope = _.merge({}, bcNeeds, bprod);
        yield abcScope;
      }
    }
  }

  return composition;
}

export const alphaExec = () => withNewScopedExec<
  m.AlphaResource,
  'alphaResource',
  m.AlphaResourceNeeds>(
    async function init({ reqString, reqBool }) {
      const alphaResource = new m.AlphaResource(0, reqString, reqBool);
      return { alphaResource };
    },
    async function destroy() {
    },
  );

export const betaExec = () => withNewScopedExec<
  m.BetaResource,
  'betaResource',
  m.BetaResourceNeeds>(
    async function init({ reqNumber, reqBool }) {
      const betaResource = new m.BetaResource(0, reqNumber, reqBool);
      return { betaResource };
    },
    async function destroy() {
    },
  );
export const gammaExec = () => withNewScopedExec<
  m.GammaResource,
  'gammaResource',
  m.GammaResourceNeeds>(
    async function init({ alphaResource, betaResource }) {
      return { gammaResource: new m.GammaResource(0) };
    },
    async function destroy() {
    },
  );


describe('Scoped Execution', () => {
  it.only('should compose', async () => {
    const alpha = alphaExec();
    const beta = betaExec();
    const gamma = gammaExec();

    const reqString = 'dude...';
    const reqBool = true;
    const reqNumber = 42;

    const alphaBeta = compose(alpha, beta)
    const alphaBetaGamma = compose(alphaBeta, gamma);

    for await (const { betaResource, alphaResource, gammaResource } of alphaBetaGamma({ reqString, reqBool, reqNumber })) {
      putStrLn({ alphaResource, betaResource, gammaResource });
    }
  });
  it('compose', async () => {
    const alpha = alphaExec();
    const beta = betaExec();
    const gamma = gammaExec();

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

    const alphaBeta = compose(alpha, beta)

    for await (const { alphaResource, betaResource } of alphaBeta({ reqString, reqBool, reqNumber })) {
    }

    const alphaBetaGamma = compose(alphaBeta, gamma);
    for await (const { betaResource, alphaResource, gammaResource } of alphaBetaGamma({ reqString, reqBool, reqNumber })) {
    }
  });
});

// type Parm0<F extends ((...args: any) => any)> = Parameters<F>[0];
// const alpha = m.scopedAlphaResource()
// type XF1 = GenFunc<typeof alpha>;
// type XF1Func = UnpackFunc<XF1>;
// type XNeeds1 = AsObject<Parameters<XF1Func>[0]>;
// type XInScope1 = AsObject<ReturnType<XF1Func>>;
// type XUsage1x = $Diff<XInScope1, XNeeds1>;
// type XUsage1 = SymmetricDifference<$Keys<XInScope1>, $Keys<XNeeds1>>;

// const beta = m.scopedBetaResource();
// type XF2Func = UnpackFunc<typeof beta>;
// type XNeeds2 = AsObject<Parameters<XF2Func>[0]>;
// type XInScope2 = AsObject<ReturnType<XF2Func>>;
// type XCompositeInput = XNeeds1 & Omit<XNeeds2, XUsage1>;

// type XInnerScope = XInScope1 & XInScope2;
