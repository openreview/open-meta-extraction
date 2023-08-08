import _ from 'lodash';


type Eventual<T> = T | Promise<T>;

// TODO get rid of Partial<product> passthrough behavior
export class ScopedResource<
  UsageT,
  NameT extends string,
  NeedsT extends object = {},
  ProductT extends Record<NameT, UsageT> = Record<NameT, UsageT>,
  UseArgsT extends Partial<ProductT> & NeedsT = Partial<ProductT> & NeedsT,
  WithUsageT extends NeedsT & ProductT = NeedsT & ProductT
> {
  name: NameT;
  init: (args: NeedsT) => Eventual<ProductT>;
  destroy: (used: WithUsageT) => Eventual<void>;

  constructor(
    name: NameT,
    init: (args: NeedsT) => Eventual<ProductT>,
    destroy: (used: WithUsageT) => Eventual<void>
  ) {
    this.name = name;
    this.init = init;
    this.destroy = destroy;
  }

  async getOrInit(useArgs: UseArgsT): Promise<WithUsageT> {
    const provided: UsageT | undefined = useArgs[this.name];
    if (provided) {
      return useArgs as any as WithUsageT;
    }
    const used: ProductT = await Promise.resolve(this.init(useArgs));
    const withU: WithUsageT = _.merge(used, useArgs) as any as WithUsageT;
    return withU;
  }

  async* use(args: UseArgsT): AsyncGenerator<WithUsageT, void, any> {
    let resource: WithUsageT = await this.getOrInit(args);
    yield resource;
    this.destroy(resource);
  }
}

export function makeScopedResource<
  UsageT,
  NameT extends string,
  NeedsT extends object = {},
  ProductT extends Record<NameT, UsageT> = Record<NameT, UsageT>,
  UseArgsT extends Partial<ProductT> & NeedsT = Partial<ProductT> & NeedsT,
  WithUsageT extends NeedsT & ProductT = NeedsT & ProductT
>(
  name: NameT,
  init: (n: NeedsT) => Eventual<ProductT>,
  destroy: (used: WithUsageT) => Eventual<void>,
): ScopedResource<UsageT, NameT, NeedsT, ProductT, UseArgsT, WithUsageT> {
  const sr = new ScopedResource<UsageT, NameT, NeedsT, ProductT, UseArgsT, WithUsageT>(name, init, destroy);
  return sr;
}
