import _ from 'lodash';
import { newIdGenerator } from './utils';
import { getServiceLogger } from './basic-logging';
import { Logger } from 'winston';

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

// Naming Conventions:
// UsageT: the type of the resource which will be available in scope
// NameT: the key under which the resource will be available, e.g. myServer in { myServer: serverInstance }
// NeedsT: the requirements to instantiate resource UsageT
// ProductT: the record shape in which UsageT is provided, i.e., { [n: NameT]: UsageT }
// WithUsageT: The full record provided to the user in scope, which is the merged value of ProductT and NeedsT
export class ScopedResource<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
  ProductT extends Record<NameT, UsageT> = Record<NameT, UsageT>,
  WithUsageT extends ProductT & NeedsT = ProductT & NeedsT
> {
  name: NameT;
  id: string;
  init: (args: NeedsT) => Eventual<ProductT>;
  destroy: (used: WithUsageT) => Eventual<void>;
  isClosed: boolean = false;
  log: Logger;

  constructor(
    name: NameT,
    init: (args: NeedsT) => Eventual<ProductT>,
    destroy: (used: WithUsageT) => Eventual<void>,
    log?: Logger
  ) {
    this.name = name;
    this.init = init;
    this.destroy = destroy;
    this.id = resourceId(name);
    this.log = log || getServiceLogger(this.id);
    this.log.debug(`${this.id}:new`)

  }

  async getOrInit(useArgs: NeedsT): Promise<WithUsageT> {
    const used: ProductT = await Promise.resolve(this.init(useArgs));
    const withU: WithUsageT = _.merge(used, useArgs) as any as WithUsageT;
    return withU;
  }
  async close(used: WithUsageT): Promise<void> {
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

  async* use(args: NeedsT): AsyncGenerator<WithUsageT, void, any> {
    let resource: WithUsageT = await this.getOrInit(args);
    this.log.debug(`${this.id}:yielding`)
    try {
      yield resource;
    } catch (error: unknown) {
      this.log.debug(`${this.id}:caught error`);
      throw error;
    } finally {
      this.log.debug(`${this.id}:yielded`)
      await this.close(resource);
    }
  }
}

export function withScopedResource<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
  ProductT extends Record<NameT, UsageT> = Record<NameT, UsageT>,
  WithUsageT extends NeedsT & ProductT = NeedsT & ProductT
>(
  name: NameT,
  init: (n: NeedsT) => Eventual<ProductT>,
  destroy: (used: WithUsageT) => Eventual<void>,
  log?: Logger
): (needs: NeedsT) => AsyncGenerator<WithUsageT, void, any> {
  const sr = new ScopedResource<UsageT, NameT, NeedsT, ProductT, WithUsageT>(name, init, destroy, log);
  const boundUse = _.bind(sr.use, sr);
  return boundUse;
}

type N1 = {
  n: number;
  b: boolean;
}
type P1 = {
  o: { q: number };
}
type N2 = {
  b: boolean;
  o: { q: number };
  s: string;
}
type N2o = Omit<N2, 'q'>;
type N2e = Omit<N2, 'o'>;
const asdf: N2o = { b: true, s: '', o: { q: 3 } }
type NAll = N1 & N2o;

// type Record<K extends keyof any, T> = {
//     [P in K]: T;
// };

type ProductT<NameT extends string, UsageT> = { [k in NameT]: UsageT };
type InScope<NeedsT, NameT extends string, UsageT> = NeedsT & ProductT<NameT, UsageT>;

type MaybeOmit<
  AvailableScope,
  Key extends string,
  Val,
  Needs,
> = Needs extends Record<Key, Val> ? Needs : Needs;

type MaybeOmit2<
  PriorNeeds,
  Key extends string,
  Val,
// { [k in NameT]: UsageT };
  Needs,
> = Needs extends Record<Key, Val> ? Needs : Needs;

export function combineScopedResources<
  UsageT1 extends {},
  UsageT2 extends {},
  NameT1 extends string,
  NameT2 extends string,
  NeedsT1 extends Record<string, any>,
  NeedsT2 extends Record<string, any>,
// below here is all derived stuff, maybe get rid of it?
// ProductT1 extends Record<NameT1, UsageT1> = Record<NameT1, UsageT1>,
// ProductT2 extends Record<NameT2, UsageT2> = Record<NameT2, UsageT2>,
// WithUsageT1 extends NeedsT1 & ProductT1 = NeedsT1 & ProductT1,
// WithUsageT2 extends NeedsT2 & ProductT2 = NeedsT2 & ProductT2
>(
  gen1: (needs: NeedsT1) => AsyncGenerator<InScope<NeedsT1, NameT1, UsageT1>, void, any>,
  gen2: (needs: NeedsT2) => AsyncGenerator<InScope<NeedsT2, NameT2, UsageT2>, void, any>,
): (
  // all needs for T1 and also T2 except what is provided by T1
  needs: NeedsT1 & Omit<NeedsT2, NameT1>
) => AsyncGenerator<InScope<NeedsT1, NameT1, UsageT1> & InScope<NeedsT2, NameT2, UsageT2>, void, any> {

  type Foo = number;
  async function* composition<InNeeds extends NeedsT1 & Omit<NeedsT2, NameT1>>(
    needs: InNeeds
  ): AsyncGenerator<InScope<NeedsT1, NameT1, UsageT1> & InScope<NeedsT2, NameT2, UsageT2>, void, any> {
    for await (const prod1 of gen1(needs)) {
      // TODO figure out typing such that 'as any as' is not needed
      // const p2Needs: NeedsT2 = _.merge(needs, prod1) as any as NeedsT2;
      const p2Needs = _.merge(needs, prod1);
      for await (const prod2 of gen2(p2Needs)) {
        yield _.merge({}, prod1, prod2);
      }
    }
  };
  return composition;
}

// type ProductT<R> = Record<`${R}`, R>;
// type InScope<R> = Record<`${R}`, R>;

// export function combineScopes<
//   UsageT1,
//   NameT1 extends string,
//   UsageT2,
//   NeedsT1 extends Record<string, any> = {},
//   NeedsT2 extends Record<string, any> = {},
// >(
//   gen1: (needs: NeedsT1) => AsyncGenerator<InScope<>, void, any>,
//   gen2: (needs: NeedsT2) => AsyncGenerator<InScope<>, void, any>,
// ): (needs: NeedsT1) => AsyncGenerator<WithUsageT1 & WithUsageT2, void, any> {
// }
