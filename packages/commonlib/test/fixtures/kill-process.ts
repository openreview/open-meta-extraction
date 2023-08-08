import { makeScopedResource, newIdGenerator, prettyPrint, putStrLn, scopedGracefulExit, withScopedResource } from "~/index";

const args = process.argv;
const userArg1 = args[2];

const arg1Num = Number.parseInt(userArg1, 10);
putStrLn(`Will exit at pos #${arg1Num}`);

const exitPosGen = newIdGenerator(0);
function maybeExit() {
  const pos = exitPosGen();
  if (pos === arg1Num) {
    putStrLn(`Exiting at pos ${pos}`);
    process.exit(0);
  }
}

class PrimaryResource {
  isClosed: boolean;
  id: number;
  constructor(id: number) {
    this.id = id;
    this.isClosed = false;
    putStrLn(`construct:${id}`);
  }
  async close() {
    putStrLn(`close:${this.id}`);
    if (this.isClosed) {
      putStrLn(`close:${this.id} ERROR already closed`);
      return;
    }
    putStrLn(`closed:${this.id}`);
    this.isClosed = true;
  }
}

const idGen = newIdGenerator(0);

const withPrimary = withScopedResource<PrimaryResource, 'primaryResource'>(
  'primaryResource',
  () => {
    const id = idGen();
    putStrLn(`init:${id}`)
    const primaryResource = new PrimaryResource(id);
    return { primaryResource }
  },
  ({ primaryResource }) => {
    const id = primaryResource.id;
    putStrLn(`destroy:${id}`)
  }
);

async function run() {
  for await (const { gracefulExit } of scopedGracefulExit.use({})) {
    maybeExit();
    for await (const { primaryResource } of withPrimary({})) {
      gracefulExit.addHandler(() => primaryResource.close());
      maybeExit();
    }
    maybeExit();
  }
  maybeExit();
}

async function runNested() {
  for await (const { gracefulExit } of scopedGracefulExit.use({})) {
    maybeExit();

    for await (const { primaryResource: p1 } of withPrimary({})) {
      gracefulExit.addHandler(() => p1.close());
      maybeExit();

      for await (const { primaryResource: p2 } of withPrimary({})) {
        gracefulExit.addHandler(() => p2.close());
        maybeExit();

        for await (const { primaryResource: p3 } of withPrimary({})) {
          gracefulExit.addHandler(() => p3.close());
          maybeExit();
        }
        maybeExit();
      }
      maybeExit();
    }
    maybeExit();
  }
  maybeExit();
}


runNested();
