import { generateFromBatch } from './generators';

// This function generates an array of 3-char strings
async function* increasingNumStrings(
  batchCount: number,
  batchSize: number,
  finalBatchSize: number
): AsyncGenerator<string[], void, void> {
  let currNum = 0;
  for (let batchNum = 0; batchNum < batchCount; batchNum++) {
    const stringBatch: string[] = [];
    const bs = batchNum < batchCount - 1 ? batchSize : finalBatchSize;
    for (let i = 0; i < bs; i++) {
      const s = currNum.toString().padStart(3, '0');
      stringBatch.push(s);
      currNum++;
    }
    yield stringBatch;
  }
}

describe('Generator Utils', () => {
  it('generate strings', async () => {
    const generator = generateFromBatch(increasingNumStrings(3, 3, 1), 8);
    let i = 0;
    for await (const s of generator) {
      expect(Number.parseInt(s)).toBe(i);
      i++
    }
    const last = await generator.next();
    expect(last).toMatchObject({ done: true, value: undefined });
  });

  it('end if limit is specified', async () => {
    const limit = 10;
    const generator = generateFromBatch(increasingNumStrings(10, 3, 1), limit);

    let next = await generator.next();
    for (; !next.done; next = await generator.next()) {
      expect(typeof next.value).toBe('string');
    }
    expect(next.value).toEqual(limit);
  });

  it('end if limit is specified and batch size is bigger than limit', async () => {
    const limit = 10;
    const generator = generateFromBatch(increasingNumStrings(1, 30, 30), limit);

    let next = await generator.next();
    for (; !next.done; next = await generator.next()) {
      expect(typeof next.value).toBe('string');
    }
    expect(next.value).toEqual(limit);
  });
});
