/*
 * Definitions for control flow abstractions for creating pipelines for
 * spidering, field extractors
 */

import _ from 'lodash';

import { pipe, flow as fptsFlow } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either';
import { Logger } from 'winston';
import Async from 'async';
import { prettyFormat } from '~/util/pretty-print';
import { setLogLabel, getServiceLogger } from '~/util/basic-logging';

export interface TaskFlow<Env extends BaseEnv> {
  succeedWith<A>(a: A, w: Env): TaskSuccess<A, Env>;

  failWith(ci: Explanation, w: Env): TaskFailure<Env>;

  initArg<A>(a: A, w: Env): TE.TaskEither<TaskFailure<Env>, TaskSuccess<A, Env>>;

  // Namespace support for logging:
  // Bracket the given function by  pushing/popping the given name onto a stack in Env
  // Allows log functions to include a context prefix for better execution tracing
  useNamespace: <A, B>(name: string, func: Transform<A, B, Env>) => Transform<A, B, Env>;

  //
  withCarriedWA: <A, Env extends BaseEnv>(func: Transform<A, unknown, Env>) => Transform<A, A, Env>;

  // Create a Transform that runs the supplied function iff input is Success/Right(...)
  through<A, B>(f: ClientFunc<A, B, Env>, name?: string, postHook?: LogHook<A, B, Env>,): Transform<A, B, Env>;

  // Create a Tap Transform that runs the supplied function iff input is Failure/Left(...)
  throughLeft<A>(f: ControlFunc<Env>): Tap<A, Env>;

  // Create a Tap Transform that runs the supplied function iff input is Failure/Left(...)
  tapLeft<A>(f: ControlFunc_<Env>): Tap<A, Env>;

  // Create a Tap Transform that runs on Env in both success/failure cases
  tapEitherEnv<A>(f: (e: Env) => unknown): Tap<A, Env>;

  // Create a Tap Transform that runs the supplied function iff input is Success/Right(...)
  tap<A>(f: ClientFunc<A, unknown, Env>, name?: string): Tap<A, Env>;

  // Convert one Env type into another. Used when two pipelines defined with
  // different Env types need to be run in sequence.
  mapEnv<A, Env2 extends BaseEnv>(
    fl: (e: Env) => Env2,
    fr: (e: Env, a: A) => Eventual<Env2>
  ): EnvTransform<A, Env, Env2>;

  filter<A>(f: ClientFunc<A, boolean, Env>, name?: string, postHook?: LogHook<A, boolean, Env>,): FilterTransform<A, Env>;

  // Turn a transform (A) => B  into a transform (A[]) => B[]
  forEachDo: <A, B> (func: Transform<A, B, Env>) => Transform<A[], B[], Env>;

  collectFanout: <A, B> (...funcs: Transform<A, B, Env>[]) => Transform<A, B[], Env>;
  takeWhileSuccess: <A, Env extends BaseEnv> (...funcs: Transform<A, A, Env>[]) => Transform<A, A, Env>;
  eachOrElse: <A, B> (...funcs: Transform<A, B, Env>[]) => Transform<A, B, Env>;

  log: <A>(level: LogLevel, f: (a: A, env: Env) => string) => Transform<A, A, Env>;

  Transform: {
    lift: <A, B>(
      fab: ClientFunc<A, B, Env>,
      postHook?: (a: A, eb: Perhaps<B>, env: Env) => void,
    ) => Transform<A, B, Env>;
  };


  ExtractionTask: {
    succeedWith: <A>(a: Eventual<A>, env: Env) => ExtractionTask<A, Env>;
    failWith: <A>(ci: Eventual<Explanation>, env: Env) => ExtractionTask<A, Env>;
  };

  ClientFunc: {
    succeedWith: <A>(a: A) => Perhaps<A>;
    failWith: <A>(msg: string) => Perhaps<A>;
  }
}


function isELeft<A>(a: any): a is E.Left<A> {
  const isObj = typeof a === 'object';
  const isTagged = isObj && '_tag' in a;

  return isObj && isTagged && a._tag === 'Left' && 'left' in a;
}

function isERight<A>(a: any): a is E.Right<A> {
  const isObj = typeof a === 'object';
  const isTagged = isObj && '_tag' in a;
  return isObj && isTagged && a._tag === 'Right' && 'right' in a;
}


export type Explanation = Error[] | string[];

export interface BaseEnv {
  ns: string[];
  enterNS(ns: string[]): void;
  exitNS(ns: string[]): void;
  log: Logger;
}

export function initBaseEnv(logOrName: Logger | string): BaseEnv {
  const log = typeof logOrName === 'string'
    ? getServiceLogger(logOrName)
    : logOrName;

  const e: BaseEnv = {
    log,
    ns: [],
    enterNS(ns: string[]) {
      setLogLabel(log, _.join(ns, '/'));
    },
    exitNS(ns: string[]) {
      setLogLabel(log, _.join(ns, '/'));
    }
  };
  return e;
}

/**
 * A [value, environment] pair, the basic  unit that is passed through Transform
 * functions
 */
export type WithEnv<A, Env extends BaseEnv> = [a: A, env: Env];

function succeedWith<A, Env extends BaseEnv>(a: A, w: Env): WithEnv<A, Env> {
  return [a, w];
}

function initArg<A, Env extends BaseEnv>(a: A, env: Env): TE.TaskEither<TaskFailure<Env>, WithEnv<A, Env>> {
  return TE.right(succeedWith(a, env));
}

export type TaskFailure<Env extends BaseEnv> = WithEnv<Explanation, Env>;
export type TaskSuccess<A, Env extends BaseEnv> = WithEnv<A, Env>;
export type TaskResult<A, Env extends BaseEnv> = E.Either<TaskFailure<Env>, TaskSuccess<A, Env>>;

function failWith<Env extends BaseEnv>(ci: Explanation, w: Env): TaskFailure<Env> {
  return [ci, w];
}

/**
 * Type signatures for client functions and return types
 */

export type Eventual<A> = A | Promise<A>;

export type Perhaps<A> = E.Either<Explanation, A>;

export type LogHook<A, B, Env extends BaseEnv> = (a: A, eb: Perhaps<B>, env: Env) => void;

export type ClientResult<A> = Eventual<A>
  | Eventual<Perhaps<A>>
  | TE.TaskEither<Explanation, A>
  ;

export type ClientFunc<A, B, Env extends BaseEnv> = (a: A, env: Env) => ClientResult<B>;

export type ControlFunc<Env extends BaseEnv> =
  (ci: Explanation, env: Env) => Explanation;

export type ControlFunc_<Env extends BaseEnv> =
  (ci: Explanation, env: Env) => unknown;

const ClientFunc = {
  succeedWith: <A>(a: A): Perhaps<A> => E.right(a),
  failWith: <A>(msg: string): Perhaps<A> => E.left([msg]),
};


/// ///////////
/// Lifted function types

export type EventualResult<A, Env extends BaseEnv> = Promise<TaskResult<A, Env>>;
const EventualResult = {
  succeedWith: <A, Env extends BaseEnv>(a: Eventual<A>, env: Env): EventualResult<A, Env> =>
    Promise.resolve<A>(a).then(a0 => E.right(succeedWith(a0, env))),

  failWith: <A, Env extends BaseEnv>(ci: Eventual<Explanation>, env: Env): EventualResult<A, Env> =>
    Promise.resolve<Explanation>(ci).then(ci0 => E.left(succeedWith(ci0, env))),
};

// Basic Task type, which when run will produce either success as Right([A,  Env]), or failure as Left([Control, Env])
export type ExtractionTask<A, Env extends BaseEnv> = TE.TaskEither<TaskFailure<Env>, WithEnv<A, Env>>;

const ExtractionTask = {
  succeedWith: <A, Env extends BaseEnv>(a: Eventual<A>, env: Env): ExtractionTask<A, Env> =>
    () => EventualResult.succeedWith(a, env),

  failWith: <A, Env extends BaseEnv>(ci: Eventual<Explanation>, env: Env): ExtractionTask<A, Env> =>
    () => EventualResult.failWith(ci, env),
};

export interface Transform<A, B, Env extends BaseEnv> {
  (ra: ExtractionTask<A, Env>): ExtractionTask<B, Env>;
}

export type Tap<A, Env extends BaseEnv> = Transform<A, A, Env>;

export type EnvTransform<A, EnvA extends BaseEnv, EnvB extends BaseEnv> =
  (t: ExtractionTask<A, EnvA>) => ExtractionTask<A, EnvB>;

const Transform = {
  lift: <A, B, Env extends BaseEnv>(
    fab: ClientFunc<A, B, Env>,
    postHook?: (a: A, eb: Perhaps<B>, env: Env) => void,
  ): Transform<A, B, Env> => (er: ExtractionTask<A, Env>) => {

    return pipe(
      er,
      TE.fold(
        ([controlInstruction, env]) => {
          return ExtractionTask.failWith(controlInstruction, env);
        },
        ([prev, env]) => {
          return () => Promise.resolve(fab(prev, env))
            .then(async (result) => {

              if (isELeft(result)) {
                const ci = result.left;
                //
                if (postHook) {
                  postHook(prev, result, env);
                }
                return EventualResult.failWith<B, Env>(ci, env);
              }
              if (isERight(result)) {
                const b = result.right;
                ///
                if (postHook) {
                  postHook(prev, result, env);
                }
                return EventualResult.succeedWith<B, Env>(b, env);
              }
              if (_.isFunction(result)) {
                return result()
                  .then(res => {
                    if (postHook) {
                      postHook(prev, res, env);
                    }
                    if (E.isLeft(res)) {
                      return EventualResult.failWith<B, Env>(res.left, env);
                    }
                    return EventualResult.succeedWith<B, Env>(res.right, env);
                  });
              }

              if (postHook) {
                postHook(prev, E.right(result), env);
              }
              return EventualResult.succeedWith(result, env);
            })
            .catch((error: any) => {
              return EventualResult.failWith<B, Env>([error], env);
            });
        }
      ));
  }
};


export type FilterTransform<A, Env extends BaseEnv> = Transform<A, A, Env>;
export type ExtractionFunction<A, B, Env extends BaseEnv> = (a: A, env: Env) => ExtractionTask<B, Env>;
export type FilterFunction<A, Env extends BaseEnv> = ExtractionFunction<A, A, Env>;
export type EnvFunction<B, Env extends BaseEnv> = ExtractionFunction<void, B, Env>;

export const compose: typeof fptsFlow = (...fs: []) =>
  <A extends readonly unknown[]>(a: A) =>
    pipe(a, ...fs);

const pushNS:
  <A, Env extends BaseEnv>(name: string) => Transform<A, A, Env> =
  <A, Env extends BaseEnv>(name: string) => (ra: ExtractionTask<A, Env>) => {
    return pipe(
      ra,
      TE.map(([a, env]) => {
        env.ns.push(name);
        env.enterNS(env.ns);
        return succeedWith(a, env);
      }),
      TE.mapLeft(([a, env]) => {
        env.ns.push(name);
        env.enterNS(env.ns);
        return succeedWith(a, env);
      })
    );
  };

const popNS:
  <A, Env extends BaseEnv>() => Transform<A, A, Env> =
  <A, Env extends BaseEnv>() => (ra: ExtractionTask<A, Env>) => {
    return pipe(
      ra,

      TE.map(([a, env]) => {
        env.ns.pop();
        env.exitNS(env.ns);
        return succeedWith(a, env);
      }),
      TE.mapLeft(([a, env]) => {
        env.ns.pop();
        env.exitNS(env.ns);
        return succeedWith(a, env);
      }),
    );
  };

const useNamespace:
  <A, B, Env extends BaseEnv>(name: string, func: Transform<A, B, Env>) => Transform<A, B, Env> =
  <A, B, Env extends BaseEnv>(name: string, func: Transform<A, B, Env>) => (ra: ExtractionTask<A, Env>) => pipe(
    ra,
    pushNS(name),
    func,
    popNS()
  );

const carryWA:
  <A, B, Env extends BaseEnv>(func: Transform<A, B, Env>) => Transform<A, [B, WithEnv<A, Env>], Env> =
  <A, B, Env extends BaseEnv>(func: Transform<A, B, Env>) => {
    let origWA: WithEnv<A, Env>;

    return (ra: ExtractionTask<A, Env>) => pipe(
      ra,
      TE.map((wa) => {
        origWA = wa;
        return wa;
      }),
      func,
      TE.chain(([b, env]) => {
        return TE.right(succeedWith([b, origWA], env));
      }),
    );
  };


const withCarriedWA: <A, Env extends BaseEnv>(func: Transform<A, unknown, Env>) => Transform<A, A, Env> = (func) => ra => pipe(
  ra,
  carryWA(func),
  TE.map(([[_b, wa], _envb]) => wa),
);

function separateResults<A, Env extends BaseEnv>(
  extractionResults: ExtractionTask<A, Env>[]
): Task.Task<[Array<WithEnv<Explanation, Env>>, Array<WithEnv<A, Env>>]> {
  return () => Async.mapSeries<ExtractionTask<A, Env>, TaskResult<A, Env>>(
    extractionResults,
    Async.asyncify(async (er: ExtractionTask<A, Env>) => er()))
    .then((settled: TaskResult<A, Env>[]) => {
      const lefts: TaskFailure<Env>[] = [];
      const rights: WithEnv<A, Env>[] = [];
      _.each(settled, result => {
        if (isLeft(result)) lefts.push(result.left);
        else rights.push(result.right);
      });
      return [lefts, rights];
    });
}


// Control flow primitives
/// given as: A[]
/// given func: A => B
//  each(as, a => func(a)), then filter(isRight)
const forEachDo:
  <A, B, Env extends BaseEnv> (func: Transform<A, B, Env>) => Transform<A[], B[], Env> =
  <A, B, Env extends BaseEnv>(func: Transform<A, B, Env>) => (ra: ExtractionTask<A[], Env>) => {
    return pipe(
      ra,
      TE.chain((wa: WithEnv<A[], Env>) => {
        const [aas, env] = wa;
        const bbs = _.map(aas, (a) => {
          const env0 = _.clone(env);
          return func(TE.right(succeedWith<A, Env>(a, env0)));
        });
        const leftRightErrs = separateResults(bbs);
        const rightTasks = pipe(
          leftRightErrs,
          Task.map(([_lefts, rights]) => {
            const bs = _.map(rights, ([b]) => b);
            const lefts = _.map(_lefts, ([b]) => b);
            const env0 = _.clone(env);
            const leftMsg = lefts.map((ci) => `${ci}`).join(', ');
            env.log.debug(`forEachDo:lefts:${leftMsg}`);
            return succeedWith(bs, env0);
          })
        );
        return TE.fromTask(rightTasks);
      })
    );
  };

const scatterAndSettle: <A, B, Env extends BaseEnv> (
  ...funcs: Transform<A, B, Env>[]
) => Transform<A, TaskResult<B, Env>[], Env> =
  <A, B, Env extends BaseEnv>(...funcs: Transform<A, B, Env>[]) =>
    (ra: ExtractionTask<A, Env>) =>
      pipe(
        ra,
        TE.chain(([a, env]: WithEnv<A, Env>) => {
          const bbs = _.map(funcs, (func) => {
            const env0 = _.clone(env);
            return func(TE.right(succeedWith(a, env0)));
          });
          const sequenced = () => Async
            .mapSeries<ExtractionTask<B, Env>, TaskResult<B, Env>>(
              bbs,
              Async.asyncify(async (er: ExtractionTask<A, Env>) => er())
            );
          const pBsTask = pipe(
            sequenced,
            Task.map((perhapsBs) => succeedWith(perhapsBs, env))
          );
          return TE.fromTask(pBsTask);
        })
      );

// Given a single input A, produce an array of Bs by running the given array of functions on the initial A
const collectFanout:
  <A, B, Env extends BaseEnv>(...funcs: Transform<A, B, Env>[]) => Transform<A, B[], Env> =
  <A, B, Env extends BaseEnv>(...funcs: Transform<A, B, Env>[]) => (ra: ExtractionTask<A, Env>) => {
    return pipe(
      ra,
      tap((_a, { log }) => {
        log.info(`Begin fanOut(${funcs.length})`);
      }),
      useNamespace(`fanOut(${funcs.length})`, scatterAndSettle(...funcs)),
      TE.chain(([settledBs, env]) => {
        const bs: B[] = [];
        let fails = 0;
        _.each(settledBs, (wb) => {
          if (E.isRight(wb)) {
            const [b] = wb.right;
            bs.push(b);
          } else {
            fails += 1;
          }
        });
        env.log.debug(`End fanOut(${funcs.length}); ${bs.length}/${fails} succ/fail`);
        return TE.right(succeedWith(bs, env));
      })
    );
  };



const __takeWhileSuccess:
  <A, Env extends BaseEnv>(funcs: Transform<A, A, Env>[], arrowCount: number) => Transform<A, A, Env> =
  <A, Env extends BaseEnv>(funcs: Transform<A, A, Env>[], arrowCount: number) => (ra: ExtractionTask<A, Env>) => {
    // Base Case:
    if (funcs.length === 0) return ra;

    // Recursive Step:
    const headTransform: Transform<A, A, Env> = funcs[0];
    const tailTransforms: Transform<A, A, Env>[] = funcs.slice(1);
    const arrowNum = arrowCount - funcs.length;
    const ns = `#${arrowNum}`;

    return pipe(
      ra,
      withCarriedWA(useNamespace(
        ns,
        headTransform
      )),
      __takeWhileSuccess(tailTransforms, arrowCount)
    );
  };

// Compose funcs
const takeWhileSuccess: <A, Env extends BaseEnv> (...funcs: Transform<A, A, Env>[]) => Transform<A, A, Env> =
  (...funcs) => useNamespace(
    `takeWhileSuccess:${funcs.length}`,
    __takeWhileSuccess(funcs, funcs.length)
  );

const __eachOrElse: <A, B, Env extends BaseEnv>(funcs: Transform<A, B, Env>[], arrowCount: number) => Transform<A, B, Env> =
  (funcs, arrowCount) => (ra) => {
    // Base Case:
    if (funcs.length === 0) {
      return pipe(
        ra,
        TE.chain(([, env]) => {
          return TE.left(failWith([], env));
        })
      );
    }

    // Recursive Step:
    const headTransform = funcs[0];
    const tailTransforms = funcs.slice(1);
    const arrowNum = arrowCount - funcs.length;
    const ns = `attempt(${arrowNum + 1} of ${arrowCount})`;

    return pipe(
      ra,
      TE.chain(([a, env]) => {
        const origWA = TE.right(succeedWith(a, env));

        const headAttempt = pipe(origWA, useNamespace(ns, headTransform));
        const fallback = pipe(origWA, __eachOrElse(tailTransforms, arrowCount));

        return TE.orElse(() => fallback)(headAttempt);
      }),
    );
  };

const eachOrElse: <A, B, Env extends BaseEnv> (...funcs: Transform<A, B, Env>[]) => Transform<A, B, Env> =
  (...funcs) => __eachOrElse(funcs, funcs.length);


const hook: <A, B, Env extends BaseEnv>(f: (a: A, b: Perhaps<B>, env: Env) => void) =>
  LogHook<A, B, Env> = (f) => f;

function shortFormat(v: any): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';

  if (_.isArray(v)) {
    const shortArray = _.join(_.map(v, shortFormat), ', ');
    return `[len=${v.length}: ${shortFormat(shortArray)}]`;
  }
  if (_.isObject(v)) {
    const cname = v?.constructor?.name;
    if (cname !== undefined) {
      return cname;
    }
    const pretty = prettyFormat(v);
    const line0 = pretty.split('\n')[0];
    return line0.substring(0, 50);
  }

  const prettified = prettyFormat(v.toString().trim()).substring(0, 50);
  return _.join(_.split(prettified, '\n'), ' ');
}

function through<A, B, Env extends BaseEnv>(
  f: ClientFunc<A, B, Env>,
  name?: string,
  postHook?: LogHook<A, B, Env>,
): Transform<A, B, Env> {
  const ns = name ? `do:${name}` : '';

  const mhook = <A>() => hook<A, B, Env>((a, b, env) => {
    const msg = pipe(b, E.fold(
      (ci) => `✗ ${ci}: ${shortFormat(a)} `,
      (res) => `✓ ${shortFormat(a)} => ${shortFormat(res)}`
    ));
    env.log.info(msg);
  });

  const fhook = postHook || name ? mhook() : undefined;
  return (ra) => pipe(
    ra,
    pushNS(ns),
    Transform.lift(f, fhook),
    popNS(),
  );
}

function throughLeft<A, Env extends BaseEnv>(
  f: ControlFunc<Env>,
): Transform<A, A, Env> {
  return (ra) => pipe(
    ra,
    TE.mapLeft(([ci, env]) => {
      const fres = f(ci, env);
      const ci0 = fres || ci;
      return succeedWith(ci0, env);
    }),
  );
}

function tapLeft<A, Env extends BaseEnv>(
  f: ControlFunc_<Env>,
): Transform<A, A, Env> {
  return (ra) => pipe(
    ra,
    TE.mapLeft(([ci, env]) => {
      f(ci, env);
      return succeedWith(ci, env);
    }),
  );
}

function mapEnv<A, Env extends BaseEnv, Env2 extends BaseEnv>(
  fl: (e: Env) => Env2,
  fr: (e: Env, a: A) => Eventual<Env2>
): EnvTransform<A, Env, Env2> {
  const mappedEnv = (taskIn: ExtractionTask<A, Env>) => pipe(
    TE.right({}),
    TE.bind('inW', ({}) => taskIn),
    TE.bind('a', ({ inW }) => { const [a,] = inW; return TE.right(a); }),
    TE.bind('env1', ({ inW }) => { const [, env1] = inW; return TE.right(env1); }),
    TE.bind('env2', ({ a, env1 }) => {
      const env2 = Promise.resolve<Env2>(fr(env1, a)).then(e => E.right<TaskFailure<Env>, Env2>(e));
      return () => env2;
    }),
    TE.mapLeft(([ci, env1]) => {
      const envx = fl(env1);
      return failWith(ci, envx);
    }),
    TE.map(({ a, env2 }) => {
      return succeedWith(a, env2);
    })
  );

  return mappedEnv;
}

function tapEitherEnv<A, Env extends BaseEnv>(
  f: (env: Env) => unknown
): Transform<A, A, Env> {
  return compose(
    tap((_0, env) => f(env)),
    tapLeft((_0, env) => {
      f(env);
    })
  );
}

function tap<A, Env extends BaseEnv>(
  f: ClientFunc<A, unknown, Env>, name?: string
): Transform<A, A, Env> {
  const arrowf = Transform.lift(f);
  const tapped = name ? useNamespace(`tap:${name}`, arrowf) : arrowf;
  return withCarriedWA(tapped);
}

function liftFilter<A, Env extends BaseEnv>(
  f: ClientFunc<A, boolean, Env>,
  name?: string,
  postHook?: LogHook<A, boolean, Env>,
): Transform<A, boolean, Env> {
  const filterHook = <A>() => hook<A, A, Env>((a, b, env) => {
    const msg = pipe(b, E.fold(
      (ci) => `( ${shortFormat(a)} ) => fail(${ci})`,
      (b0) => `( ${shortFormat(a)} ) => ${b0 ? 'pass' : 'fail'}`
    ));
    env.log.info(msg);
  });
  const fhook = postHook || name ? filterHook() : undefined;

  return Transform.lift<A, boolean, Env>(f, fhook);
}

function filter<A, Env extends BaseEnv>(
  f: ClientFunc<A, boolean, Env>,
  name?: string,
  postHook?: LogHook<A, boolean, Env>,
): FilterTransform<A, Env> {
  const fa: FilterTransform<A, Env> = (ra: ExtractionTask<A, Env>) => {
    const ns = name ? `filter(${name})` : 'filter(?)';

    return pipe(
      ra,
      carryWA(useNamespace(
        ns,
        liftFilter(f, name, postHook)
      )),
      TE.chain(([[cond, origWA], env]) => {
        return cond
          ? TE.right(origWA)
          : TE.left<TaskFailure<Env>, WithEnv<A, Env>>(failWith([], env));
      }),
    );
  };

  return fa;
}

export type LogLevel = 'info'
  | 'debug'
  | 'warn'
  | 'error'
  ;


const log = <A, Env extends BaseEnv>(
  level: LogLevel,
  f: (a: A, env: Env) => string
) => tap((a: A, env: Env) => env.log.log(level, `${f(a, env)}`));

export function createTaskFlow<Env extends BaseEnv>(): TaskFlow<Env> {
  const fp: TaskFlow<Env> = {
    succeedWith,
    initArg,
    failWith,
    useNamespace,
    withCarriedWA,
    forEachDo,
    collectFanout,
    eachOrElse,
    takeWhileSuccess,
    through,
    throughLeft,
    tapLeft,
    tapEitherEnv,
    tap,
    mapEnv,
    filter,
    log,
    Transform,
    ExtractionTask,
    ClientFunc,
  };
  return fp;
}
