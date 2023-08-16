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



export class LogRecorder {
  logBuffer: string[];

  constructor(logBuffer: string[]) {
    this.logBuffer = logBuffer
  }

  log(msg: string) {
    this.logBuffer.push(msg);
  }
}


export const loggerExec = () =>
  withScopedExec<LogRecorder, 'logRecorder', { logBuffer: string[] }>(
    async function init({ logBuffer }) {
      return { logRecorder: new LogRecorder(logBuffer) };
    },
  );

export type AlphaResourceNeeds = {
  logRecorder: LogRecorder;
  reqString: string;
  reqBool: boolean;
}

export class AlphaResource {
  id: number;
  reqString: string;
  reqBool: boolean
  logRecorder: LogRecorder;
  constructor(
    id: number,
    reqString: string,
    reqBool: boolean,
    logRecorder: LogRecorder
  ) {
    logRecorder.log('alphaResource: construct')
    this.id = id;
    this.reqString = reqString;
    this.reqBool = reqBool;
    this.logRecorder = logRecorder;
  }
}

export const alphaExec = () =>
  withScopedExec<AlphaResource, 'alphaResource', AlphaResourceNeeds>(
    async function init({ reqString, reqBool, logRecorder }) {
      logRecorder.log('alphaResource: init')
      const alphaResource = new AlphaResource(0, reqString, reqBool, logRecorder);
      return { alphaResource };
    },
    async function destroy({ logRecorder }) {
      logRecorder.log('alphaResource: destroy')
    },
  );



export type BetaResourceNeeds = {
  logRecorder: LogRecorder;
  reqBool: boolean,
  reqNumber: number,
};

export class BetaResource {
  id: number;
  reqNumber: number;
  reqBool: boolean
  logRecorder: LogRecorder;

  constructor(needs: BetaResourceNeeds) {
    needs.logRecorder.log('betaResource: construct')
    this.id = 0;
    this.reqNumber = needs.reqNumber;
    this.reqBool = needs.reqBool;
    this.logRecorder = needs.logRecorder;
  }
}

export const betaExec = () =>
  withScopedExec<BetaResource, 'betaResource', BetaResourceNeeds>(
    async function init(needs) {
      needs.logRecorder.log('betaResource: init')
      const betaResource = new BetaResource(needs);
      return { betaResource };
    },
    async function destroy({ logRecorder }) {
      logRecorder.log('betaResource: destroy')
    }
  );

export type GammaResourceNeeds = {
  logRecorder: LogRecorder;
  alphaResource: AlphaResource
  betaResource: BetaResource
};

export class GammaResource {
  id: number;
  logRecorder: LogRecorder;
  alphaResource: AlphaResource;
  betaResource: BetaResource;
  constructor(needs: GammaResourceNeeds) {
    needs.logRecorder.log('gammaResource: construct')
    this.id = 0;
    this.logRecorder = needs.logRecorder;
    this.alphaResource = needs.alphaResource;
    this.betaResource = needs.betaResource;
  }
}

export const gammaExec = () =>
  withScopedExec<GammaResource, 'gammaResource', GammaResourceNeeds>(
    async function init(needs) {
      needs.logRecorder.log('gammaResource: init')
      return { gammaResource: new GammaResource(needs) };
    },
    async function destroy({ logRecorder }) {
      logRecorder.log('gammaResource: destroy')
    },
  );
