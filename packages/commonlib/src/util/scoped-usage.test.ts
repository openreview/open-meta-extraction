import _ from 'lodash';

import { putStrLn } from "./pretty-print";
import { withScopedResource } from "./scoped-usage";
import { newIdGenerator } from './utils';

class PrimaryResource {
  isPrimary: boolean = true;
  id: number;
  constructor(id: number) {
    putStrLn(`new PrimaryResource(#${id})`);
    this.id = id;
  }
}

const scopedPrimary = withScopedResource<PrimaryResource, 'primaryResource', {}>(
  'primaryResource',
  () => {
    putStrLn(`primaryResource: init`)
    const primaryResource = new PrimaryResource(0);
    return { primaryResource }
  },
  (r) => {
    putStrLn('primaryResource: destroy')
  }
);



class DerivedResource {
  isPrimary: boolean = false;
  isDerived: boolean = true;
  primaryResource: PrimaryResource;

  constructor(p: PrimaryResource) {
    this.primaryResource = p;
  }
}


const scopedDerived = withScopedResource<
  DerivedResource,
  'derivedResource',
  { primaryResource: PrimaryResource }
>(
  'derivedResource',
  ({ primaryResource }) => {
    putStrLn('derivedResource: init')
    const derivedResource = new DerivedResource(primaryResource);
    return { derivedResource };
  },
  (r) => { putStrLn('derivedResource: destroy') }
);

const scopedDeferredDerived = withScopedResource<
  DerivedResource,
  'derivedResource',
  { primaryResource: PrimaryResource }
>(
  'derivedResource',
  async ({ primaryResource }) => {
    putStrLn('derivedResource: init')
    const derivedResource = new DerivedResource(primaryResource);
    return Promise.resolve({ derivedResource });
  },
  async (r) => { putStrLn('derivedResource: destroy') }
);

describe('Scoped Usage', () => {
  it('should be creatable through helper functions', async () => {
    for await (const pr of scopedPrimary({})) {
      for await (const dr of scopedDerived(pr)) {
        // prettyPrint({ pr, dr })
      }
    }
  });

  it('should be handle async resources', async () => {
    for await (const pr of scopedPrimary({})) {
      for await (const dr of scopedDeferredDerived(pr)) {
        // prettyPrint({ pr, dr })
      }
    }
  });

  it('should use with.. syntax', async () => {
    const idGen = newIdGenerator(0);
    const pScoped = withScopedResource<PrimaryResource, 'primaryResource'>(
      'primaryResource',
      () => {
        const id = idGen();
        putStrLn(`primaryResource#${id}: init`)
        const primaryResource = new PrimaryResource(id);
        return { primaryResource }
      },
      ({ primaryResource }) => {
        const id = primaryResource.id;
        putStrLn(`primaryResource${id}: destroy`)
      }
    );

    for await (const { primaryResource } of pScoped({})) {
      for await (const { primaryResource:p2 } of pScoped({})) {
      }
    }

  });
});

// export type PrimaryResourceProduct = {
//   primaryResource: PrimaryResource;
// };

// export type UsePrimaryResourceArgs = Partial<PrimaryResourceProduct>;
// export type WithPrimaryResource = PrimaryResourceProduct;

// export async function* usePrimaryResource(args: UsePrimaryResourceArgs): AsyncGenerator<WithPrimaryResource, void, any> {
//   let resource = args.primaryResource;
//   if (!resource) {
//     resource = new PrimaryResource();
//     // defer( close )
//   }
//   yield { primaryResource: resource };
// }
// export type DerivedResourceProduct = {
//   derivedResource: DerivedResource
// };
// export type UseDerivedResourceArgs = WithPrimaryResource & Partial<DerivedResourceProduct>;
// export type WithDerivedResource = WithPrimaryResource & DerivedResourceProduct;

// export async function* useDerivedResource(args: UseDerivedResourceArgs): AsyncGenerator<WithDerivedResource, void, any> {
//   let resource = args.derivedResource;
//   if (!resource) {
//     resource = new DerivedResource(args.primaryResource);
//     // defer( close )
//   }
//   yield _.merge({ derivedResource: resource }, args);
// }
