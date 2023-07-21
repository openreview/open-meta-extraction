import _ from 'lodash';
import { respondWith, isGETEqual, withServer } from './test-http-server';

import { setLogEnvLevel } from '@watr/commonlib';

describe('REST Worker Endpoints', () => {
  setLogEnvLevel('info');

  it('should use withServer() and properly shutdown', async () => {
    await withServer((r) => {r.get('/bar', respondWith({ bar: 'foo' }))
      r.get('/foo', respondWith({ foo: 'bar' }))
    }, async () => {
      await isGETEqual('http://localhost:9100/foo', { foo: 'bar' })
      await isGETEqual('http://localhost:9100/bar', { bar: 'foo' })
    });
  });

});
