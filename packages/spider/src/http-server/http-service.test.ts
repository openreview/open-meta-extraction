import _ from 'lodash';
import { Router, respondWithJson, scopedHttpServer } from './http-service';
import axios from 'axios';
import { withGracefulExit } from '@watr/commonlib';

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


    for await (const { gracefulExit } of withGracefulExit()({})) {
      for await (const {} of scopedHttpServer()({ gracefulExit, port, routerSetup: setup })) {

        await expectGETEqual('http://localhost:9100/foo', { foo: 'bar' })
        await expectGETEqual('http://localhost:9100/bar', { bar: 'foo' })
      }
    }
  });

});
