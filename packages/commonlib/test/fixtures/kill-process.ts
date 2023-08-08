import { makeScopedResource, newIdGenerator, prettyPrint, putStrLn, scopedGracefulExit, withScopedResource } from "~/index";

const args = process.argv;
const userArg1 = args[2];

const arg1Num = Number.parseInt(userArg1, 10);
putStrLn(`Passed in # ${arg1Num}`);

function maybeExit(pos: number) {
  if (pos === arg1Num) {
    putStrLn(`Exiting at pos ${pos}`);
    process.exit(0);
  }
}
type PrimaryResourceNeeds = {
}

class PrimaryResource {
  isClosed: boolean;
  id: number;
  constructor(id: number) {
    this.id = id;
    this.isClosed = false;
    putStrLn(`new PrimaryResource(#${id})`);
  }
  async close() {
    putStrLn('running close()')
    if (this.isClosed) {
      putStrLn('ERROR: already closed')
      return;
    }
    putStrLn('OK: closed')
    this.isClosed = true;
  }
}
// class PrimaryResource {
//   isClosed: boolean;
//   constructor() {
//     this.isClosed = false;
//     putStrLn('new PrimaryResource()');
//   }
// }
const scopedPrimary = makeScopedResource<PrimaryResource, 'primaryResource', PrimaryResourceNeeds>(
  'primaryResource',
  ({}) => {
    const primaryResource = new PrimaryResource(0);
    return { primaryResource }
  },
  async ({ primaryResource }) => {
    await primaryResource.close();
  }
);

const idGen = newIdGenerator(1);
const withPrimary = withScopedResource<PrimaryResource, 'primaryResource'>(
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
async function run1() {
  for await (const { gracefulExit } of scopedGracefulExit.use({})) {
    maybeExit(0);
    for await (const { primaryResource } of scopedPrimary.use({})) {
      gracefulExit.addHandler(() => primaryResource.close());
      maybeExit(1);
    }
    maybeExit(2);
  }
  maybeExit(3);
}

async function run() {
  for await (const { gracefulExit } of scopedGracefulExit.use({})) {
    maybeExit(0);
    for await (const { primaryResource } of withPrimary({})) {
      gracefulExit.addHandler(() => primaryResource.close());
      maybeExit(1);
    }
    maybeExit(2);
  }
  maybeExit(3);
}

run();
