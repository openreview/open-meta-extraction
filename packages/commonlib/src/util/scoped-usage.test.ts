import _ from 'lodash';

import { putStrLn } from "./pretty-print";
import { combineScopedResources, withScopedResource } from "./scoped-usage";
import { newIdGenerator } from './utils';

class PrimaryResource {
  isPrimary: boolean = true;
  id: number;
  constructor(id: number) {
    putStrLn(`new PrimaryResource(#${id})`);
    this.id = id;
  }
}

function newPrimaryScope() {
  return withScopedResource<PrimaryResource, 'primaryResource', {}>(
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
}

class DerivedResource {
  isPrimary: boolean = false;
  isDerived: boolean = true;
  primaryResource: PrimaryResource;

  constructor(p: PrimaryResource) {
    this.primaryResource = p;
  }
}

function newDerivedScope() {
  return withScopedResource<
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
}


function newDeferredDerivedScope() {
  return withScopedResource<
    DerivedResource,
    'deferDerivedResource',
    { primaryResource: PrimaryResource }
  >(
    'deferDerivedResource',
    async ({ primaryResource }) => {
      putStrLn('derivedResource: init')
      const deferDerivedResource = new DerivedResource(primaryResource);
      return Promise.resolve({ deferDerivedResource });
    },
    async (r) => { putStrLn('derivedResource: destroy') }
  );
}

describe('Scoped Usage', () => {
  it('should be creatable through helper functions', async () => {
    for await (const pr of newPrimaryScope()({})) {
      for await (const dr of newDerivedScope()(pr)) {
        // prettyPrint({ pr, dr })
      }
    }
  });

  it('should be handle async resources', async () => {
    for await (const pr of newPrimaryScope()({})) {
      for await (const dr of newDeferredDerivedScope()(pr)) {
        // prettyPrint({ pr, dr })
      }
    }
  });

  it('should use with.. syntax', async () => {
    const idGen = newIdGenerator(0);
    const pScoped = () => withScopedResource<PrimaryResource, 'primaryResource'>(
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

    for await (const { primaryResource } of pScoped()({})) {
      for await (const { primaryResource: p2 } of pScoped()({})) {
      }
    }
  });

  it.only('should permit composition', async () => {
    const ps1 = newPrimaryScope();
    const ps2 = newDerivedScope();
    const ps3 = newDeferredDerivedScope();

    const ps12 = combineScopedResources(ps1, ps2);
    const ps123 = combineScopedResources(ps12, ps3);


    for await (const { primaryResource, derivedResource, deferDerivedResource } of ps123({})) {

    }

  });
});
