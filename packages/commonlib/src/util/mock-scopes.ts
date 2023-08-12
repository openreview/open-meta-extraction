import { putStrLn } from "./pretty-print";
import { scopedResource, withScopedResource } from "./scoped-usage";

class PrimaryResource {
  isPrimary: boolean = true;
  id: number;
  constructor(id: number) {
    putStrLn(`new PrimaryResource(#${id})`);
    this.id = id;
  }
}

export const scopedPrimaryResource = () => withScopedResource<
  PrimaryResource,
  'primaryResource'
>(
  'primaryResource',
  async function init({}) {
    const primaryResource = new PrimaryResource(0);
    return { primaryResource };
  },
  async function destroy() {
  },
);

class DerivedResource {
  isPrimary: boolean = false;
  isDerived: boolean = true;
  primaryResource: PrimaryResource;

  constructor(p: PrimaryResource) {
    this.primaryResource = p;
  }
}

export const scopedDerivedResource = () => withScopedResource<
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
  () => { putStrLn('derivedResource: destroy') }
);

export const scopedDeferredResource = () => withScopedResource<
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
  async () => { putStrLn('derivedResource: destroy') }
);


export type AlphaResourceNeeds = {
  reqString: string;
  reqBool: boolean;
}

export class AlphaResource {
  id: number;
  reqString: string;
  reqBool: boolean
  constructor(id: number, reqString: string, reqBool: boolean) {
    putStrLn(`new AlphaResource(#${id})`);
    this.id = id;
    this.reqString = reqString;
    this.reqBool = reqBool;
  }
}

export const alphaResource = () => scopedResource<
  AlphaResource,
  'alphaResource',
  AlphaResourceNeeds>(
    'alphaResource',
    async function init({ reqString, reqBool }) {
      const alphaResource = new AlphaResource(0, reqString, reqBool);
      return { alphaResource };
    },
    async function destroy() {
    },
  );

export const scopedAlphaResource = () => withScopedResource<
  AlphaResource,
  'alphaResource',
  AlphaResourceNeeds>(
    'alphaResource',
    async function init({ reqString, reqBool }) {
      const alphaResource = new AlphaResource(0, reqString, reqBool);
      return { alphaResource };
    },
    async function destroy() {
    },
  );

export type BetaResourceNeeds = {
  reqBool: boolean,
  reqNumber: number,
};

export class BetaResource {
  id: number;
  reqNumber: number;
  reqBool: boolean
  constructor(id: number, reqNumber: number, reqBool: boolean) {
    putStrLn(`new BetaResource(#${id})`);
    this.id = id;
    this.reqNumber = reqNumber;
    this.reqBool = reqBool;
  }
}

export const betaResource = () => scopedResource<
  BetaResource,
  'betaResource',
  BetaResourceNeeds>(
    'betaResource',
    async function init({ reqBool, reqNumber }) {
      const betaResource = new BetaResource(0, reqNumber, reqBool);
      return { betaResource };
    },
    async function destroy() {
    },
  );
export const scopedBetaResource = () => withScopedResource<
  BetaResource,
  'betaResource',
  BetaResourceNeeds>(
    'betaResource',
    async function init({ reqBool, reqNumber }) {
      const betaResource = new BetaResource(0, reqNumber, reqBool);
      return { betaResource };
    },
    async function destroy() {
    },
  );

export type GammaResourceNeeds = {
  alphaResource: AlphaResource
  betaResource: BetaResource
};

export class GammaResource {
  id: number;
  constructor(id: number) {
    putStrLn(`new GammaResource(#${id})`);
    this.id = id;
  }
}
