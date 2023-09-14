import _ from 'lodash';

import { newIdGenerator } from './utils';
import { getServiceLogger } from './basic-logging';
import { Logger } from 'winston';

/**
 * Provides  composable  managed execution  scopes,  within  which services  are
 * available,  and  cleanup/shutdown is  guaranteed  when  the scope  is  exited
 * Similar to python context manager
 *
 * Example:
 *                        NameT: UsageT
 *     for await (const { mongoDB } of mongoDBScope()({})) {
 *         //
 *     }
 *
 * ----------------------------------
 *
 * Naming Conventions:
 *    - UsageT: the type of the resource which will be available in scope
 *    - NameT: the key under which the resource will be available, e.g. myServer in { myServer: serverInstance }
 *    - ProductT: the record shape in which UsageT is provided, i.e., { [n: NameT]: UsageT }
 *    - NeedsT: the requirements to instantiate resource UsageT
 *    - InScope : The full record provided to the user in scope, which is the merged value of ProductT and NeedsT
 **/

type Eventual<T> = T | Promise<T>;

// The record type of the resource provided by this scope, e.g., { connectionPool: ConnectionPool }
type Product<NameT extends string, UsageT> = Record<NameT, UsageT>;

// The type of AsyncGenerator used
export type Generate<T> = AsyncGenerator<T, void, any>;

// The thing that is generated
export type Yielded<G> = G extends Generate<infer T> ? T : never;

// Function which defines an execution scope (context)
export type ContextFunc = (needs: any) => Generate<any>;

// The input (needs) to a context function
export type ContextNeeds<T> = T extends ((arg: infer A) => Generate<unknown>) ? A : never;

// Everything provided in execution scope, which is Needs+Product
export type InScope<F extends ContextFunc> = Yielded<ReturnType<F>>;


// Lifecycle management for execution scopes
export class ScopedExec<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
> {
  id: string = '<uninitd>';
  init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>;
  destroy?: (used: Product<NameT, UsageT> & NeedsT) => Eventual<void>;

  isUsed: boolean = false;
  isClosed: boolean = false;
  log: Logger;

  constructor(
    init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>,
    destroy?: (used: Product<NameT, UsageT> & NeedsT) => Eventual<void>,
  ) {
    this.init = init;
    this.destroy = destroy;
    this.log = getServiceLogger(this.id);
    this.log.verbose(`${this.id}:new`)

  }

  async getOrInit(useArgs: NeedsT): Promise<Product<NameT, UsageT>> {
    const used: Product<NameT, UsageT> = await Promise.resolve(this.init(useArgs));
    const name = _.keys(used).join('.');
    this.id = resourceId(name);
    this.log = getServiceLogger(this.id);

    return used;
  }

  async close(used: Product<NameT, UsageT> & NeedsT): Promise<void> {
    this.log.verbose(`${this.id}:close`)
    if (this.isClosed) {
      this.log.verbose(`${this.id}.close: already closed`)
      return;
    }
    this.isClosed = true;
    if (this.destroy) {
      this.log.verbose(`${this.id}:close.destroying`)
      await Promise.resolve(this.destroy(used));
      this.log.verbose(`${this.id}:close.destroyed`)
    }
  }


  async* use(args: NeedsT): AsyncGenerator<Product<NameT, UsageT>, void, any> {
    if (this.isUsed) {
      throw new Error(`${this.id} already used, cannot be used again`);
    }
    this.isUsed = true;
    const product: Product<NameT, UsageT> = await this.getOrInit(args)
      .catch(error => {
        this.log.error(`${this.id}:initialization error: ${error}`);
        throw error;
      });

    try {
      this.log.verbose(`${this.id}:yielding`)
      yield product;
    } catch (error: unknown) {
      this.log.error(`${this.id}:caught error`);
      throw error;
    } finally {
      this.log.verbose(`${this.id}:yielded`)
      await this.close(_.merge(product, args));
    }
  }
}

export function withScopedExec<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
>(
  init: (n: NeedsT) => Eventual<Product<NameT, UsageT>>,
  destroy?: (used: NeedsT & Product<NameT, UsageT>) => Eventual<void>,
): (needs: NeedsT) => AsyncGenerator<Product<NameT, UsageT>, void, any> {
  const sr = new ScopedExec<UsageT, NameT, NeedsT>(init, destroy);
  const boundUse = _.bind(sr.use, sr);
  return boundUse;
}

// **********
type BothNeeds<
  F1 extends (a: any) => Generate<any>,
  F2 extends (a: any) => Generate<any>,
> = ContextNeeds<F1> & Omit<ContextNeeds<F2>, keyof InScope<F1>>;


type InBothScopes<
  F1 extends (a: any) => Generate<any>,
  F2 extends (a: any) => Generate<any>,
> = InScope<F1> & InScope<F2>

type GenerateBothScopes<
  F1 extends (a: any) => Generate<any>,
  F2 extends (a: any) => Generate<any>,
> = Generate<InBothScopes<F1, F2>>;

export type ComposedContextFuncs<
  F1 extends ContextFunc,
  F2 extends ContextFunc
> = (needs: BothNeeds<F1, F2>) => GenerateBothScopes<F1, F2>;

export function compose2Scopes<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  AScope extends object,
  BScope extends object
>(
  ab: (an: ANeeds) => Generate<AScope>,
  bc: (bn: BNeeds) => Generate<BScope>,
): ComposedContextFuncs<typeof ab, typeof bc> {

  async function* composition(compneeds: BothNeeds<typeof ab, typeof bc>): GenerateBothScopes<typeof ab, typeof bc> {
    for await (const aprod of ab(compneeds)) {
      const bcNeeds = _.merge({}, compneeds, aprod) as any;
      for await (const bprod of bc(bcNeeds)) {
        const abcScope = _.merge({}, bcNeeds, bprod);
        yield abcScope;
      }
    }
  }

  return composition;
}


export function composeScopes<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  AScope extends object,
  BScope extends object
>(
  ab: (an: ANeeds) => Generate<AScope>,
  bc: (bn: BNeeds) => Generate<BScope>,
): ComposedContextFuncs<typeof ab, typeof bc>;



export function composeScopes<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  CNeeds extends Readonly<object>,
  AScope extends object,
  BScope extends object,
  CScope extends object
>(
  fa: (n: ANeeds) => Generate<AScope>,
  fb: (n: BNeeds) => Generate<BScope>,
  fc: (n: CNeeds) => Generate<CScope>,
):
  ComposedContextFuncs<
    ComposedContextFuncs<typeof fa, typeof fb>, typeof fc>;

export function composeScopes<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  CNeeds extends Readonly<object>,
  DNeeds extends Readonly<object>,
  AScope extends object,
  BScope extends object,
  CScope extends object,
  DScope extends object
>(
  fa: (n: ANeeds) => Generate<AScope>,
  fb: (n: BNeeds) => Generate<BScope>,
  fc: (n: CNeeds) => Generate<CScope>,
  fd: (n: DNeeds) => Generate<DScope>,
):
  ComposedContextFuncs<
    ComposedContextFuncs<
      ComposedContextFuncs<typeof fa, typeof fb>, typeof fc>, typeof fd>;

export function composeScopes<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  CNeeds extends Readonly<object>,
  DNeeds extends Readonly<object>,
  ENeeds extends Readonly<object>,
  AScope extends object,
  BScope extends object,
  CScope extends object,
  DScope extends object,
  EScope extends object
>(
  fa: (n: ANeeds) => Generate<AScope>,
  fb: (n: BNeeds) => Generate<BScope>,
  fc: (n: CNeeds) => Generate<CScope>,
  fd: (n: DNeeds) => Generate<DScope>,
  fe: (n: ENeeds) => Generate<EScope>,
):
  ComposedContextFuncs<
    ComposedContextFuncs<
      ComposedContextFuncs<
        ComposedContextFuncs<typeof fa, typeof fb>, typeof fc>, typeof fd>, typeof fe>;

export function composeScopes<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  CNeeds extends Readonly<object>,
  DNeeds extends Readonly<object>,
  ENeeds extends Readonly<object>,
  FNeeds extends Readonly<object>,
  AScope extends object,
  BScope extends object,
  CScope extends object,
  DScope extends object,
  EScope extends object,
  FScope extends object,
>(
  fa: (n: ANeeds) => Generate<AScope>,
  fb: (n: BNeeds) => Generate<BScope>,
  fc: (n: CNeeds) => Generate<CScope>,
  fd: (n: DNeeds) => Generate<DScope>,
  fe: (n: ENeeds) => Generate<EScope>,
  ff: (n: FNeeds) => Generate<FScope>,
):
  ComposedContextFuncs<
    ComposedContextFuncs<
      ComposedContextFuncs<
        ComposedContextFuncs<
          ComposedContextFuncs<typeof fa, typeof fb>, typeof fc>, typeof fd>, typeof fe>, typeof ff>;

export function composeScopes<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  CNeeds extends Readonly<object>,
  DNeeds extends Readonly<object>,
  ENeeds extends Readonly<object>,
  FNeeds extends Readonly<object>,
  GNeeds extends Readonly<object>,
  AScope extends object,
  BScope extends object,
  CScope extends object,
  DScope extends object,
  EScope extends object,
  FScope extends object,
  GScope extends object,
>(
  fa: (n: ANeeds) => Generate<AScope>,
  fb: (n: BNeeds) => Generate<BScope>,
  fc: (n: CNeeds) => Generate<CScope>,
  fd: (n: DNeeds) => Generate<DScope>,
  fe: (n: ENeeds) => Generate<EScope>,
  ff: (n: FNeeds) => Generate<FScope>,
  fg: (n: GNeeds) => Generate<GScope>,
):
  ComposedContextFuncs<
    ComposedContextFuncs<
      ComposedContextFuncs<
        ComposedContextFuncs<
          ComposedContextFuncs<
            ComposedContextFuncs<typeof fa, typeof fb>, typeof fc>, typeof fd>, typeof fe>, typeof ff>, typeof fg>;

export function composeScopes(
  f1: ContextFunc,
  f2: ContextFunc,
  f3?: ContextFunc,
  f4?: ContextFunc,
  f5?: ContextFunc,
  f6?: ContextFunc,
  f7?: ContextFunc,
  // f8?: ContextFunc,
  // f9?: ContextFunc,
): ComposedContextFuncs<typeof f1, any> {

  const comp2: ComposedContextFuncs<typeof f1, typeof f2> = compose2Scopes(f1, f2);
  if (f3 === undefined) return comp2;

  const comp3: ComposedContextFuncs<typeof comp2, typeof f3> = compose2Scopes(comp2, f3);
  if (f4 === undefined) return comp3;

  const comp4: ComposedContextFuncs<typeof comp3, typeof f4> = compose2Scopes(comp3, f4);
  if (f5 === undefined) return comp4;

  const comp5: ComposedContextFuncs<typeof comp4, typeof f5> = compose2Scopes(comp4, f5);
  if (f6 === undefined) return comp5;

  const comp6: ComposedContextFuncs<typeof comp5, typeof f6> = compose2Scopes(comp5, f6);
  if (f7 === undefined) return comp6;

  const comp7: ComposedContextFuncs<typeof comp6, typeof f7> = compose2Scopes(comp6, f7);
  return comp7;
}

// Produces unique ids for execution scopes to help with logging
const resourceIdSet = new Map<string, () => number>();
function resourceId(name: string): string {
  let nextId = resourceIdSet.get(name)
  if (nextId) {
    return `${name}${nextId()}`;
  }
  nextId = newIdGenerator(1);
  resourceIdSet.set(name, nextId);
  return `${name}${nextId()}`;
}

