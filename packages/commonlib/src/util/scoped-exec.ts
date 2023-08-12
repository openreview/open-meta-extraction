
import _ from 'lodash';
import { newIdGenerator } from './utils';
import { getServiceLogger } from './basic-logging';
import { Logger } from 'winston';
import * as t from './utility-types'

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
type InScope<NeedsT, NameT extends string, UsageT> = NeedsT & Product<NameT, UsageT>;

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
  name: NameT;
  id: string;
  init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>;
  destroy: (used: InScope<NeedsT, NameT, UsageT>) => Eventual<void>;
  isClosed: boolean = false;
  log: Logger;

  constructor(
    name: NameT,
    init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>,
    destroy: (used: InScope<NeedsT, NameT, UsageT>) => Eventual<void>,
    log?: Logger
  ) {
    this.name = name;
    this.init = init;
    this.destroy = destroy;
    this.id = resourceId(name);
    this.log = log || getServiceLogger(this.id);
    this.log.debug(`${this.id}:new`)

  }

  async getOrInit(useArgs: NeedsT): Promise<InScope<NeedsT, NameT, UsageT>> {
    const used: Product<NameT, UsageT> = await Promise.resolve(this.init(useArgs));
    const withU: InScope<NeedsT, NameT, UsageT> = _.merge(used, useArgs) as any;
    return withU;
  }
  async close(used: InScope<NeedsT, NameT, UsageT>): Promise<void> {
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


  async* use(args: NeedsT): AsyncGenerator<InScope<NeedsT, NameT, UsageT>, void, any> {
    let inScope: InScope<NeedsT, NameT, UsageT> = await this.getOrInit(args);
    this.log.debug(`${this.id}:yielding`)
    try {
      yield inScope;
    } catch (error: unknown) {
      this.log.debug(`${this.id}:caught error`);
      throw error;
    } finally {
      this.log.debug(`${this.id}:yielded`)
      await this.close(inScope);
    }
  }
}
export function withScopedExec<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
>(
  name: NameT,
  init: (n: NeedsT) => Eventual<Product<NameT, UsageT>>,
  destroy: (used: InScope<NeedsT, NameT, UsageT>) => Eventual<void>,
  log?: Logger
): (needs: NeedsT) => AsyncGenerator<InScope<NeedsT, NameT, UsageT>, void, any> {
  const sr = new ScopedExec<UsageT, NameT, NeedsT>(name, init, destroy, log);
  const boundUse = _.bind(sr.use, sr);
  return boundUse;
}

export class NewScopedExec<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
> {
  id: string = '<uninitd>';
  init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>;
  destroy: (used: Product<NameT, UsageT>) => Eventual<void>;
  isClosed: boolean = false;
  log: Logger;

  constructor(
    init: (args: NeedsT) => Eventual<Product<NameT, UsageT>>,
    destroy: (used: Product<NameT, UsageT>) => Eventual<void>,
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
  async close(used: Product<NameT, UsageT>): Promise<void> {
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
      await this.close(product);
    }
  }
}

export function withNewScopedExec<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
>(
  init: (n: NeedsT) => Eventual<Product<NameT, UsageT>>,
  destroy: (used: Product<NameT, UsageT>) => Eventual<void>,
  log?: Logger
): (needs: NeedsT) => AsyncGenerator<Product<NameT, UsageT>, void, any> {
  const sr = new NewScopedExec<UsageT, NameT, NeedsT>(init, destroy, log);
  const boundUse = _.bind(sr.use, sr);
  return boundUse;
}



type Generate<T> = AsyncGenerator<T, void, any>;

type GenFunc<T> = T extends ((arg: infer A) => Generate<infer R>) ?
  A extends R? (a: A) => Generate<R> : never : never;

type UnpackFunc<T> = T extends (arg: infer A) => Generate<infer R> ?
  R extends A? (a: A) => R : never : never;


type Parm0<F extends ((...args: any) => any)> = Parameters<F>[0];



// GenFunc extends (needs: { [P in keyof K]: K[P] }) => Generate<InScope1>,
// GenFunc extends (infer Needs: any) => Generate<InScope1>,
export function combineScopes<
  F1,
  // F1Func extends UnpackFunc<GenFunc<F1>>,
  // Needs1 extends AsObject<Parameters<F1Func>[0]>,
  // InScope1 extends AsObject<ReturnType<F1Func>>,
  // Usage1 extends SymmetricDifference<$Keys<InScope1>, $Keys<Needs1>>,
  F2,
  // F2Func extends UnpackFunc<F2>,
  // Needs2 extends AsObject<Parameters<F2Func>[0]>,
  // InScope2 extends AsObject<ReturnType<F2Func>>,
  // ComposeParm extends Needs1 & Omit<Needs2, Usage1>,
  // InnerScope extends InScope1 & InScope2,
>(
  gen1: GenFunc<F1>,
  gen2: GenFunc<F2>,
): void {
// ): (needs: ComposeParm) => Generate<InnerScope> {

  async function* composition<
    F1Func extends UnpackFunc<GenFunc<F1>>,
  >(needs: any): any {
  // >(needs: ComposeParm): Generate<InnerScope> {
    // for await (const prod1 of gen1(needs)) {
    //   const p2Needs = _.merge(needs, prod1);
    //   for await (const prod2 of gen2(p2Needs)) {
    //     const innerScope: InnerScope = _.merge(p2Needs, prod2) as any ;
    //     yield innerScope;
    //   }
    // }
  };
  // return composition;
}
