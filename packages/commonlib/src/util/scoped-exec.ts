import _ from 'lodash';

import { newIdGenerator } from './utils';
import { getServiceLogger } from './basic-logging';
import { Logger } from 'winston';
import { $MaybeDiff } from "./utility-types";

/**
 * Provides  composable  manage  execution  scopes, within  which  services  are
 * available, and cleanup/shutdown is guaranteed when the scope is exited
 */

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

type Eventual<T> = T | Promise<T>;
type Product<NameT extends string, UsageT> = Record<NameT, UsageT>;
type Gener<T> = AsyncGenerator<T, void, any>;
type Yielded<G> = G extends Gener<infer T> ? T : never;
type GenParam<T> = T extends ((arg: infer A) => Gener<unknown>) ? A : never;

// Naming Conventions:
// UsageT: the type of the resource which will be available in scope
// NameT: the key under which the resource will be available, e.g. myServer in { myServer: serverInstance }
// NeedsT: the requirements to instantiate resource UsageT
// ProductT: the record shape in which UsageT is provided, i.e., { [n: NameT]: UsageT }
// WithUsageT: The full record provided to the user in scope, which is the merged value of ProductT and NeedsT

export class ScopedExec<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
> {
  id: string = '<uninitd>';
  init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>;
  destroy: (used: Product<NameT, UsageT> & NeedsT) => Eventual<void>;
  isClosed: boolean = false;
  log: Logger;

  constructor(
    init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>,
    destroy: (used: Product<NameT, UsageT> & NeedsT) => Eventual<void>,
    log?: Logger
  ) {
    this.init = init;
    this.destroy = destroy;
    // this.id = resourceId(name);
    this.log = log || getServiceLogger(this.id);
    this.log.debug(`${this.id}:new`)

  }

  async getOrInit(useArgs: NeedsT): Promise<Product<NameT, UsageT>> {
    const used: Product<NameT, UsageT> = await Promise.resolve(this.init(useArgs));
    const name = _.keys(used).join('.');
    this.id = resourceId(name);
    this.log = getServiceLogger(this.id);

    // const withU: InScope<NeedsT, NameT, UsageT> = _.merge(used, useArgs) as any;
    return used;
  }
  async close(used: Product<NameT, UsageT> & NeedsT): Promise<void> {
    this.log.debug(`${this.id}:close`)
    if (this.isClosed) {
      this.log.debug(`${this.id}.close: already closed`)
      return;
    }
    this.isClosed = true;
    this.log.debug(`${this.id}:close.destroying`)
    await Promise.resolve(this.destroy(used));
    this.log.debug(`${this.id}:close.destroyed`)
  }


  async* use(args: NeedsT): AsyncGenerator<Product<NameT, UsageT>, void, any> {
    const product: Product<NameT, UsageT> = await this.getOrInit(args);
    // let inScope: InScope<NeedsT, NameT, UsageT> = await this.getOrInit(args);
    this.log.debug(`${this.id}:yielding`)
    try {
      yield product;
    } catch (error: unknown) {
      this.log.debug(`${this.id}:caught error`);
      throw error;
    } finally {
      this.log.debug(`${this.id}:yielded`)
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
  destroy: (used: NeedsT & Product<NameT, UsageT>) => Eventual<void>,
  log?: Logger
): (needs: NeedsT) => AsyncGenerator<Product<NameT, UsageT>, void, any> {
  const sr = new ScopedExec<UsageT, NameT, NeedsT>(init, destroy, log);
  const boundUse = _.bind(sr.use, sr);
  return boundUse;
}

export function composeScopes<
  ANeeds extends Readonly<object>,
  BNeeds extends Readonly<object>,
  R1 extends object,
  R2 extends object
>(
  ab: (an: ANeeds) => Gener<R1>,
  bc: (bn: BNeeds) => Gener<R2>,
): (
  needs: GenParam<typeof ab> & $MaybeDiff<GenParam<typeof bc>, Yielded<ReturnType<typeof ab>>>
) => Gener<
  Yielded<ReturnType<typeof ab>> & Yielded<ReturnType<typeof bc>> // & GenParam<typeof ab> & GenParam<typeof bc>
> {
  async function* composition(
    compneeds: GenParam<typeof ab> & $MaybeDiff<GenParam<typeof bc>, Yielded<ReturnType<typeof ab>>>
  ): Gener<
    Yielded<ReturnType<typeof ab>> & Yielded<ReturnType<typeof bc>> // & GenParam<typeof ab> & GenParam<typeof bc>
  > {
    for await (const aprod of ab(compneeds)) {
      // const needs2: $MaybeDiff<GenParam<typeof bc>, Yielded<ReturnType<typeof ab>>> = compneeds;
      const bcNeeds = _.merge({}, compneeds, aprod) as any;
      for await (const bprod of bc(bcNeeds)) {
        const abcScope = _.merge({}, bcNeeds, bprod);
        yield abcScope;
      }
    }
  }

  return composition;
}



// type Generate<T> = AsyncGenerator<T, void, any>;

// type GenFunc<T> = T extends ((arg: infer A) => Generate<infer R>) ?
//   A extends R? (a: A) => Generate<R> : never : never;

// type UnpackFunc<T> = T extends (arg: infer A) => Generate<infer R> ?
//   R extends A? (a: A) => R : never : never;


// type Parm0<F extends ((...args: any) => any)> = Parameters<F>[0];

// export class ScopedExec<
//   UsageT,
//   NameT extends string,
//   NeedsT extends Record<string, any> = {},
// > {
//   name: NameT;
//   id: string;
//   init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>;
//   destroy: (used: InScope<NeedsT, NameT, UsageT>) => Eventual<void>;
//   isClosed: boolean = false;
//   log: Logger;

//   constructor(
//     name: NameT,
//     init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>,
//     destroy: (used: InScope<NeedsT, NameT, UsageT>) => Eventual<void>,
//     log?: Logger
//   ) {
//     this.name = name;
//     this.init = init;
//     this.destroy = destroy;
//     this.id = resourceId(name);
//     this.log = log || getServiceLogger(this.id);
//     this.log.debug(`${this.id}:new`)

//   }

//   async getOrInit(useArgs: NeedsT): Promise<InScope<NeedsT, NameT, UsageT>> {
//     const used: Product<NameT, UsageT> = await Promise.resolve(this.init(useArgs));
//     const withU: InScope<NeedsT, NameT, UsageT> = _.merge(used, useArgs) as any;
//     return withU;
//   }
//   async close(used: InScope<NeedsT, NameT, UsageT>): Promise<void> {
//     this.log.debug(`${this.id}:close`)
//     if (this.isClosed) {
//       this.log.debug(`${this.id}.close: already closed`)
//       return;
//     }
//     this.isClosed = true;
//     this.log.debug(`${this.id}:close.destroying`)
//     await Promise.resolve(this.destroy(used));
//     this.log.debug(`${this.id}:close.destroyed`)
//   }


//   async* use(args: NeedsT): AsyncGenerator<InScope<NeedsT, NameT, UsageT>, void, any> {
//     let inScope: InScope<NeedsT, NameT, UsageT> = await this.getOrInit(args);
//     this.log.debug(`${this.id}:yielding`)
//     try {
//       yield inScope;
//     } catch (error: unknown) {
//       this.log.debug(`${this.id}:caught error`);
//       throw error;
//     } finally {
//       this.log.debug(`${this.id}:yielded`)
//       await this.close(inScope);
//     }
//   }
// }
// export function withScopedExec<
//   UsageT,
//   NameT extends string,
//   NeedsT extends Record<string, any> = {},
// >(
//   name: NameT,
//   init: (n: NeedsT) => Eventual<Product<NameT, UsageT>>,
//   destroy: (used: InScope<NeedsT, NameT, UsageT>) => Eventual<void>,
//   log?: Logger
// ): (needs: NeedsT) => AsyncGenerator<InScope<NeedsT, NameT, UsageT>, void, any> {
//   const sr = new ScopedExec<UsageT, NameT, NeedsT>(name, init, destroy, log);
//   const boundUse = _.bind(sr.use, sr);
//   return boundUse;
// }
