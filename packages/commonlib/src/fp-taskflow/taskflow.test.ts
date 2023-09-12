import _ from 'lodash';

import * as TE from 'fp-ts/TaskEither';
import { isRight } from 'fp-ts/Either';
import { flow as compose, pipe } from 'fp-ts/function';
import * as ft from './taskflow';
import { prettyPrint } from '~/util/pretty-print';
import { asyncEachOf } from '~/util/async-plus';
import { setLogEnvLevel } from '~/util/basic-logging';


interface FirstEnvT extends ft.BaseEnv {
  b: boolean;
  messages: string[];
}

function initFirstEnv<A>(a: A): ExtractionTask<A> {
  const baseEnv = ft.initBaseEnv('first-env');
  const env0: FirstEnvT = {
    ...baseEnv,
    b: true,
    messages: []
  };

  return TE.right(succeedWith(a, env0));
}

interface SecondEnvT extends ft.BaseEnv {
  otherField: boolean;
  messages: string[]
}

const fp1 = ft.createTaskFlow<FirstEnvT>();
const fp2 = ft.createTaskFlow<SecondEnvT>();

type ExtractionTask<A> = ft.ExtractionTask<A, FirstEnvT>;
type Transform<A, B> = ft.Transform<A, B, FirstEnvT>;
type PerhapsW<A> = ft.TaskResult<A, FirstEnvT>;
// type FilterTransform<A> = ft.FilterTransform<A, FirstEnvT>;

const {
  tap,
  tapLeft,
  tapEitherEnv,
  filter,
  Transform,
  succeedWith,
  mapEnv,
  forEachDo,
  eachOrElse,
  takeWhileSuccess,
  collectFanout,
} = fp1;


const traceFunc: <A, B>(name: string, func: Transform<A, B>) => Transform<A, B> = (name, func) => compose(
  tap((_a, env) => env.messages.push(`${name}:in:right`)),
  tapLeft((_a, env) => env.messages.push(`${name}:in:left`)),
  func,
  tap((_a, env) => env.messages.push(`${name}:out:right`)),
  tapLeft((_a, env) => env.messages.push(`${name}:out:left`)),
);

const traceArg: (func: Transform<string, string>) => Transform<string, string> = (func) => {
  let aIn: string;
  return compose(
    tap((a) => aIn = a),
    tap((_a, env) => env.messages.push(`${aIn}:in:right`)),
    tapLeft((_a, env) => env.messages.push(`${aIn}:in:left`)),
    func,
    tap((_a, env) => env.messages.push(`${aIn}:out:right`)),
    tapLeft((_a, env) => env.messages.push(`${aIn}:out:left`)),
  )
}

const succWith: (msg: string) => Transform<string, string> = msg => traceFunc(msg, filter<string>(() => true));
const failWith: (msg: string) => Transform<string, string> = msg => traceFunc(msg, filter<string>(() => false));


const isVowel: Transform<string, string> =
  traceArg(filter<string>(s => new RegExp("^[AEIOU]$", 'i').test(s), 'isVowel'));

function succInFailOut(s: string): (msgs: string[]) => boolean {
  return (msgs) => {
    const isInRight = _.some(msgs, msg => msg === `${s}:in:right`);
    const isOutLeft = _.some(msgs, msg => msg === `${s}:out:left`);
    return isInRight && isOutLeft;
  };
}

function succInOut(s: string): (msgs: string[]) => boolean {
  return (msgs) => {
    const isInRight = _.some(msgs, msg => msg === `${s}:in:right`);
    const isOutRight = _.some(msgs, msg => msg === `${s}:out:right`);
    return isInRight && isOutRight;
  };
}

function failInOut(s: string): (msgs: string[]) => boolean {
  return (msgs) => {
    const isInLeft = _.some(msgs, msg => msg === `${s}:in:left`);
    const isOutLeft = _.some(msgs, msg => msg === `${s}:out:left`);
    return isInLeft && isOutLeft;
  };
}

function noneOf(s: string): (msgs: string[]) => boolean {
  return (msgs) => {
    const hasMsg = _.some(msgs, msg => msg.startsWith(`${s}:`));
    return !hasMsg;
  };
}

function getEnvMessages(res: PerhapsW<unknown>): string[] {
  if (isRight(res)) {
    const [, env] = res.right;
    return env.messages;
  }
  const [, env] = res.left;
  return env.messages;
}

let dummy = 0;
async function runTakeWhileSuccess(fns: Transform<string, string>[]): Promise<string[]> {
  const res = await takeWhileSuccess(...fns)(initFirstEnv(`input#${dummy += 1}`))();
  return getEnvMessages(res);
}

async function runEachOrElse(fns: Transform<string, string>[]): Promise<string[]> {
  const res = await eachOrElse(...fns)(initFirstEnv(`input#${dummy += 1}`))();
  return getEnvMessages(res);
}

async function runCollectFanout(fns: Transform<string, string>[]): Promise<string[]> {
  const res = await collectFanout(...fns)(initFirstEnv(`input#${dummy += 1}`))();
  return getEnvMessages(res);
}

describe('TaskFlow control flow primitives', () => {
  // it('should create basic funcs/results', async (done) => {});
  // it('tap() composition', async (done) => { });

  type XTestTransforms = Transform<string, string>[];
  type XAssertFunc = (ss: string[]) => boolean;
  type XExpectedTrace = XAssertFunc[];
  type XExampleType = [XTestTransforms, XExpectedTrace];

  setLogEnvLevel('silly')

  it('takeWhileSuccess examples', async () => {
    const examples: XExampleType[] = [
      [
        [succWith('A'), failWith('B'), succWith('C')],
        [succInOut('A'), succInFailOut('B'), failInOut('C')]
      ], [
        [failWith('A'), succWith('B')],
        [succInFailOut('A'), failInOut('B')]
      ], [
        [succWith('A'), succWith('B')],
        [succInOut('A'), succInOut('B')]
      ],
    ];


    await asyncEachOf(examples, async (ex: XExampleType) => {
      const [example, assertFuncs] = ex;
      const messages = await runTakeWhileSuccess(example);
      const assertionsPass = _.every(assertFuncs, f => f(messages));
      expect(assertionsPass).toBe(true);
    });
  });

  it('eachOrElse examples', async () => {
    const examples: XExampleType[] = [
      [
        [succWith('A'), failWith('B'), succWith('C')],
        [succInOut('A'), noneOf('B'), noneOf('C')]
      ],
      [
        [failWith('A'), succWith('B'), succWith('C')],
        [succInFailOut('A'), succInOut('B'), noneOf('C')]
      ],
    ];


    await asyncEachOf(examples, async (ex: XExampleType) => {
      const [example, assertFuncs] = ex;
      const messages = await runEachOrElse(example);
      const assertionsPass = _.every(assertFuncs, f => f(messages));
      expect(assertionsPass).toBe(true);
    });
  });


  it('collectFanout examples', async () => {
    const examples: XExampleType[] = [
      [
        [failWith('A'), succWith('B')],
        [succInFailOut('A'), succInOut('B')]
      ], [
        [succWith('A'), failWith('B'), succWith('C')],
        [succInOut('A'), succInFailOut('B'), succInOut('C')]
      ],
    ];


    await asyncEachOf(examples, async (ex: XExampleType) => {
      const [example, assertFuncs] = ex;
      const messages = await runCollectFanout(example);
      const assertionsPass = _.every(assertFuncs, f => f(messages));
      expect(assertionsPass).toBe(true);
    });
  });

  it('forEachDo examples', async () => {
    // run one function on each element of an array, return array of successful results
    const input = 'ACE'.split('');
    const assertFuncs = [succInOut('A'), succInFailOut('C'), succInOut('E')];

    const env0 = initFirstEnv(input);
    const res = await forEachDo(isVowel)(env0)();
    const messages = getEnvMessages(res);
    const assertionsPass = _.every(assertFuncs, f => f(messages));
    expect(assertionsPass).toBe(true);

  });

  it('should convert between env types', async () => {
    function convertEnv1ToEnv2(env1: FirstEnvT): SecondEnvT {
      const baseEnv = ft.initBaseEnv('second-env');
      return {
        ...baseEnv,
        messages: [...env1.messages],
        otherField: true,
      }
    }
    function convertEnv2ToEnv1(env2: SecondEnvT): FirstEnvT {
      const baseEnv = ft.initBaseEnv('second-env');
      return {
        ...baseEnv,
        messages: [...env2.messages],
        b: env2.otherField,
      }
    }

    const runnable = pipe(
      initFirstEnv('in'),
      tapEitherEnv(e => {
        e.messages.push('Env1/1')
      }),
      mapEnv((e) => convertEnv1ToEnv2(e), (e) => convertEnv1ToEnv2(e)),
      fp2.tapEitherEnv(e => {
        e.messages.push('Env2')
      }),

      fp2.mapEnv((e) => convertEnv2ToEnv1(e), (e) => convertEnv2ToEnv1(e)),
      tapEitherEnv(e => {
        e.messages.push('Env1/2')
      }),
    );

    const res = await runnable()
    const messages = getEnvMessages(res);
    prettyPrint({ messages })
    expect(messages).toStrictEqual(['Env1/1', 'Env2', 'Env1/2'])
  });
});
