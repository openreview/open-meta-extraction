import _ from 'lodash';

import { putStrLn } from "./pretty-print";
import { combineScopedResources, withScopedResource } from "./scoped-usage";
import { newIdGenerator } from './utils';
import { scopedAlphaResource, scopedBetaResource, scopedDeferredResource, scopedDerivedResource, scopedPrimaryResource } from './mock-scopes';


describe('Scoped Usage', () => {
  it('should be creatable through helper functions', async () => {
    for await (const pr of scopedPrimaryResource()({})) {
      for await (const __ of scopedDerivedResource()(pr)) {
        // prettyPrint({ pr, dr })
      }
    }
  });

  it('should be handle async resources', async () => {
    for await (const pr of scopedPrimaryResource()({})) {
      for await (const __ of scopedDeferredResource()(pr)) {
        // prettyPrint({ pr, dr })
      }
    }
  });

  it.only('should permit composition', async () => {
    // needs: str, bool
    const alpha = scopedAlphaResource();
    // needs: bool, num
    const beta = scopedBetaResource();

    const ab = combineScopedResources(alpha, beta);

    const reqString = '';
    const reqBool = true;
    const reqNumber = 42;
    for await (const {} of ab({ reqString, reqBool, reqNumber })) {

    }

  });
});
