// @ts-ignore
import pumpify from 'pumpify';
import util from 'util';
import stream from 'stream';
import {
  stanzaChunker,
  prettyPrintTrans,
  throughFunc,
  charStream,
  arrayStream,
  tapStream,
} from './stream-utils';
import { prettyPrint } from './pretty-print';

const pipeline = util.promisify(stream.pipeline);

describe('Stream utils', () => {
  const delay = (t: number) => new Promise(resolve => setTimeout(resolve, t));

  async function doAsyncStuff(s: string): Promise<string> {
    return delay(300).then(() => {
      return Promise.resolve(`${s}_${s}`);
    });
  }

  it('process async throughput in order', async () => {
    const astr = charStream('abc');

    const output: string[] = [];
    await pipeline(
      astr,
      throughFunc(doAsyncStuff),
      tapStream((data: string) => {
        output.push(data);
      })
    );
    // prettyPrint({ output });
    expect(output).toEqual(['a_a', 'b_b', 'c_c']);

    // done();
  });

  it('should properly catch pipeline errors', done => {
    const astr = charStream('abcde');
    const pipe = pumpify.obj(astr, prettyPrintTrans('aabb'));

    pipe.on('data', (data: string) => {
      prettyPrint({ data });
    });
    pipe.on('end', () => {
      prettyPrint({ msg: 'done' });
      done();
    });
  });

  it('should turn stream of lines into stanzas (line groups)', done => {
    // const astr = es.readArray("{ a b c } { d } { e }".split(" "));
    const astr = arrayStream('{ a b c } { d } { e }'.split(' '));

    const chunker = stanzaChunker(
      l => l === '{',
      l => l === '}',
    );
    const pipe = pumpify.obj(
      astr,
      // prettyPrintTrans("line"),
      chunker
    );

    pipe.on('data', (data: string) => {
      const lines = data.split('\n');
      prettyPrint({ lines, data });
    });

    pipe.on('end', () => {
      prettyPrint({ msg: 'done' });
      done();
    });
  });

  // TODO uncomment or delete
  // it("should do parallel work on streams", async done => {
  //   async function doAsync(s: string): Promise<string> {
  //     return delay(200).then(() => {
  //       prettyPrint({ s });
  //       return Promise.resolve(`${s}_${s}`);
  //     })
  //   }
  //   const astr = charStream("abcdefgh");
  //   const pipe = pumpify.obj(
  //     astr,
  //     initEnv((t) => ({ msg: `env ${t}` })),
  //     throughFuncPar(3, doAsync),
  //   );

  //   const output: string[] = [];

  //   pipe.on("data", (data: string) => {
  //     prettyPrint({ data });
  //     output.push(data);
  //   });

  //   pipe.on("end", () => {
  //     prettyPrint({ output });
  //     done();
  //   });
  // });
});
