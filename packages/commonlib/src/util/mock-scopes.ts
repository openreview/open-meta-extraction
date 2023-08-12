import { putStrLn } from "./pretty-print";
import { withScopedExec } from "./scoped-exec";

export type PrimaryNeeds = {
}

export class Primary {
  isPrimary: boolean = true;
  needs: PrimaryNeeds;
  constructor(needs: PrimaryNeeds) {
    this.needs = needs
  }
}

export const primaryExec = () =>
  withScopedExec<Primary, 'primary', PrimaryNeeds>(
    async function init(needs) {
      return { primary: new Primary(needs) };
    },
    async function destroy() {
    },
  );

export type SecondaryNeeds = {
  primary: Primary;
}

export class Secondary {
  isSecondary: boolean = true;
  needs: SecondaryNeeds;
  constructor(needs: SecondaryNeeds) {
    this.needs = needs
  }
}

export const secondaryExec = () =>
  withScopedExec<Secondary, 'secondary', SecondaryNeeds>(
    async function init(needs) {
      return { secondary: new Secondary(needs) };
    },
    async function destroy() {
    },
  );

export type TertiaryNeeds = {
  secondary: Secondary;
}

export class Tertiary {
  isTertiary: boolean = true;
  needs: TertiaryNeeds;
  constructor(needs: TertiaryNeeds) {
    this.needs = needs
  }
}

export const tertiaryExec = () =>
  withScopedExec<Tertiary, 'tertiary', TertiaryNeeds>(
    async function init(needs) {
      return { tertiary: new Tertiary(needs) };
    },
    async function destroy() {
    },
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

export const alphaExec = () =>
  withScopedExec<AlphaResource, 'alphaResource', AlphaResourceNeeds>(
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

export const betaExec = () =>
  withScopedExec<BetaResource, 'betaResource', BetaResourceNeeds>(
    async function init({ reqNumber, reqBool }) {
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

export const gammaExec = () =>
  withScopedExec<GammaResource, 'gammaResource', GammaResourceNeeds>(
    async function init({ alphaResource, betaResource }) {
      return { gammaResource: new GammaResource(0) };
    },
    async function destroy({ gammaResource, alphaResource, betaResource }) {
    },
  );
