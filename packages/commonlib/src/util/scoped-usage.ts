import _ from 'lodash';
import { putStrLn } from './pretty-print';
import { newIdGenerator } from './utils';

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
interface Logging {
  info(s: string): void;
  warn(s: string): void;
  debug(s: string): void;
  error(s: string): void;
  trace(s: string): void;
}
class NullLogging implements Logging {
  info(): void {}
  warn(): void {}
  debug(): void {}
  error(): void {}
  trace(): void {}

}

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
  log: Logging;

  constructor(
    name: NameT,
    init: (args: NeedsT) => Eventual<ProductT>,
    destroy: (used: WithUsageT) => Eventual<void>,
    log?: Logging
  ) {
    this.name = name;
    this.init = init;
    this.destroy = destroy;
    this.id = resourceId(name);
    this.log = log || new NullLogging();
  }

  async getOrInit(useArgs: NeedsT): Promise<WithUsageT> {
    const used: ProductT = await Promise.resolve(this.init(useArgs));
    const withU: WithUsageT = _.merge(used, useArgs) as any as WithUsageT;
    return withU;
  }
  async close(used: WithUsageT): Promise<void> {
    this.log.debug(`${this.id}:close`)
    if (this.isClosed) {
      this.log.debug(`${this.id}.close(): already closed`)
      return;
    }
    this.isClosed = true;
    this.log.debug(`${this.id}:close.destroy()`)
    await Promise.resolve(this.destroy(used));
  }

  async* use(args: NeedsT): AsyncGenerator<WithUsageT, void, any> {
    let resource: WithUsageT = await this.getOrInit(args);
    this.log.debug(`${this.id}:yielding`)
    yield resource;
    this.log.debug(`${this.id}:yielded`)
    this.close(resource);
  }
}

export function withScopedResource<
  UsageT,
  NameT extends string,
  NeedsT extends object = {},
  ProductT extends Record<NameT, UsageT> = Record<NameT, UsageT>,
  WithUsageT extends NeedsT & ProductT = NeedsT & ProductT
>(
  name: NameT,
  init: (n: NeedsT) => Eventual<ProductT>,
  destroy: (used: WithUsageT) => Eventual<void>,
  log?: Logging
): (needs: NeedsT) => AsyncGenerator<WithUsageT, void, any> {
  const sr = new ScopedResource<UsageT, NameT, NeedsT, ProductT, WithUsageT>(name, init, destroy, log);
  const boundUse = _.bind(sr.use, sr);
  return boundUse;
}

export function combineScopedResources<
  UsageT1,
  UsageT2,
  NameT1 extends string,
  NameT2 extends string,
  ProductT1 extends Record<NameT1, UsageT1> = Record<NameT1, UsageT1>,
  ProductT2 extends Record<NameT2, UsageT2> = Record<NameT2, UsageT2>,
  NeedsT1 extends Record<string, any> = {},
  WithUsageT1 extends NeedsT1 & ProductT1 = NeedsT1 & ProductT1,
  NeedsT2 extends Record<string, any> = {},
  WithUsageT2 extends Record<string, any> & NeedsT2 & ProductT2 = {} & NeedsT2 & ProductT2
>(
  gen1: (needs: NeedsT1) => AsyncGenerator<WithUsageT1, void, any>,
  gen2: (needs: NeedsT2) => AsyncGenerator<WithUsageT2, void, any>,
): (needs: NeedsT1) => AsyncGenerator<WithUsageT1 & WithUsageT2, void, any> {
  // TODO (needs: NeedsT1) => AsyncGenerator<WithUsageT1 & WithUsageT2, void, any>
  //  should be (needs: NeedsT1 + (NeedsT2 - WithUsageT1)
  //  This provides everything for Usage2 other than what WithUsage1 will provide

  async function* composition(needs: NeedsT1): AsyncGenerator<WithUsageT1 & WithUsageT2, void, any> {
    for await (const prod1 of gen1(needs)) {
      // TODO figure out typing such that 'as any as' is not needed
      const p2Needs: NeedsT2 = _.merge(needs, prod1) as any as NeedsT2;
      for await (const prod2 of gen2(p2Needs)) {
        yield _.merge({}, prod1, prod2);
      }
    }
  };
  return composition;
}
