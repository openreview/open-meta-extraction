import _ from 'lodash';
import { putStrLn } from './pretty-print';


type Eventual<T> = T | Promise<T>;

export class ScopedResource<
  UsageT,
  NameT extends string,
  NeedsT extends Record<string, any> = {},
  ProductT extends Record<NameT, UsageT> = Record<NameT, UsageT>,
  WithUsageT extends ProductT & NeedsT = ProductT & NeedsT
> {
  name: NameT;
  init: (args: NeedsT) => Eventual<ProductT>;
  destroy: (used: WithUsageT) => Eventual<void>;
  isClosed: boolean = false;

  constructor(
    name: NameT,
    init: (args: NeedsT) => Eventual<ProductT>,
    destroy: (used: WithUsageT) => Eventual<void>
  ) {
    this.name = name;
    this.init = init;
    this.destroy = destroy;
  }

  async getOrInit(useArgs: NeedsT): Promise<WithUsageT> {
    const used: ProductT = await Promise.resolve(this.init(useArgs));
    const withU: WithUsageT = _.merge(used, useArgs) as any as WithUsageT;
    return withU;
  }
  async close(used: WithUsageT): Promise<void> {
    if (this.isClosed) {
      putStrLn('Close: already closed')
      return;
    }
    this.isClosed = true;
    await Promise.resolve(this.destroy(used));
  }

  async* use(args: NeedsT): AsyncGenerator<WithUsageT, void, any> {
    let resource: WithUsageT = await this.getOrInit(args);
    yield resource;
    this.close(resource);
  }
}

export function makeScopedResource<
  UsageT,
  NameT extends string,
  NeedsT extends object = {},
  ProductT extends Record<NameT, UsageT> = Record<NameT, UsageT>,
  WithUsageT extends NeedsT & ProductT = NeedsT & ProductT
>(
  name: NameT,
  init: (n: NeedsT) => Eventual<ProductT>,
  destroy: (used: WithUsageT) => Eventual<void>,
): ScopedResource<UsageT, NameT, NeedsT, ProductT, WithUsageT> {
  const sr = new ScopedResource<UsageT, NameT, NeedsT, ProductT, WithUsageT>(name, init, destroy);
  return sr;
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
): (needs: NeedsT) => AsyncGenerator<WithUsageT, void, any> {
  const sr = new ScopedResource<UsageT, NameT, NeedsT, ProductT, WithUsageT>(name, init, destroy);
  const boundUse = _.bind(sr.use, sr);
  return boundUse;
}
