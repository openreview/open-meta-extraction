import _ from 'lodash';

import { prettyPrint, putStrLn } from "./pretty-print";
import { makeScopedResource } from "./scoped-usage";

class PrimaryResource {
  isPrimary: boolean = true;
}


const scopedPrimary = makeScopedResource<PrimaryResource, 'primaryResource', {}>(
  'primaryResource',
  () => {
    putStrLn('primaryResource: init')
    const primaryResource = new PrimaryResource();
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


const scopedDerived = makeScopedResource<
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

const scopedDeferredDerived = makeScopedResource<
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
    for await (const pr of scopedPrimary.use({})) {
      for await (const dr of scopedDerived.use(pr)) {
        // prettyPrint({ pr, dr })
      }
    }
  });

  it('should be handle async resources', async () => {
    for await (const pr of scopedPrimary.use({})) {
      for await (const dr of scopedDeferredDerived.use(pr)) {
        // prettyPrint({ pr, dr })
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
