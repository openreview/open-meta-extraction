import _ from 'lodash';
import { Router, respondWithJson, scopedHttpServer } from './http-service';
import axios from 'axios';
import { scopedGracefulExit } from '@watr/commonlib';

export async function expectGETEqual(url: string, data: any) {
  const resp = await axios.get(url);
  expect(resp.data).toEqual(data);
}

export async function expectPOSTEqual(url: string, data: any) {
  const resp = await axios.post(url);
  expect(resp.data).toEqual(data);
}

describe('HTTP Service', () => {

  it('should use useHttpServer() and properly shutdown', async () => {

    function setup(r: Router) {
      r.get('/bar', respondWithJson({ bar: 'foo' }))
      r.get('/foo', respondWithJson({ foo: 'bar' }))
    }

    const port = 9100;


    for await (const { gracefulExit } of scopedGracefulExit.use({})) {
      for await (const {} of scopedHttpServer.use({ gracefulExit, port, routerSetup: setup })) {

        await expectGETEqual('http://localhost:9100/foo', { foo: 'bar' })
        await expectGETEqual('http://localhost:9100/bar', { bar: 'foo' })
      }
    }
  });

});
