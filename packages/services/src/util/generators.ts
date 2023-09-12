import { asyncDoUntil } from '@watr/commonlib';
import { randomBytes } from 'crypto';

// This function generates an array of 10 random 3-letter strings
//  AsyncGenerator<YieldT, ReturnT, NextParamT>
export async function* randomStringsGenerator(): AsyncGenerator<string[], void, void> {
  while (true) {
    const randomStrings: string[] = [];
    for (let i = 0; i < 10; i++) {
      const randomString = randomBytes(3).toString('hex').slice(0, 3);
      randomStrings.push(randomString);
    }
    yield randomStrings;
  }
}

// This function takes a number and generates that many random strings
export async function* countStringsGenerator(count: number): AsyncGenerator<string, void, void> {
  const nextBatch = await randomStringsGenerator().next();
  if (nextBatch.done) return;

  let randomStrings = nextBatch.value;

  let index = 0;

  for (let i = 0; i < count; i++) {
    if (index === randomStrings.length) {
      const nextBatch = await randomStringsGenerator().next();
      if (nextBatch.done) return;
      randomStrings = nextBatch.value;
      index = 0;
    }
    yield randomStrings[index];
    index++;
  }
}

// Generate a stream of T, using another generator
// that yields arrays of T
// Returns the total number of Ts yielded
export async function* generateFromBatch<T>(
  batchFunc: AsyncGenerator<T[], void, void>,
  limit: number
): AsyncGenerator<T, number, void> {
  let nextBatch: T[] = [];
  const runForever = limit === 0;

  let index = 0;

  for (let i = 0; i < limit || runForever; i++) {
    if (index === nextBatch.length) {
      const next = await batchFunc.next();
      if (next.done) {
        return i;
      }
      nextBatch = next.value;
      index = 0;
    }
    yield nextBatch[index];
    index++;
  }
  return limit;
}

export async function asyncGenToArray<T>(asyncGen: AsyncGenerator<T, void, void>): Promise<T[]> {
  const ret: T[] = [];
  await asyncDoUntil(
    async () => {
      const n = await asyncGen.next()
      if (!n.done) ret.push(n.value)
      return !!n.done;
    },
    async (isDone) => isDone
  );
  return ret;
}
