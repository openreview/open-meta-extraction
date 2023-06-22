/**
 * Functions for gathering metadata from html <head> section
 * These include many of the 'standard' metadata formats, (DublinCore et. al),
 * along with some non-standard variations found in the wild.
 **/


import {
  collectFanout,
  compose
} from '~/predef/extraction-prelude';

import {
  forInputs,
  selectAllMetaEvidence,
  selectElemTextEvidence,
  selectMetaEvidence,
} from '~/core/extraction-primitives';

import { loadBrowserPage } from './html-query-primitives';


export const gatherHighwirePressTags = collectFanout(
  selectMetaEvidence('citation_title'),
  selectMetaEvidence('citation_date'),
  selectMetaEvidence('citation_pdf_url'),
  selectMetaEvidence('citation_abstract'),
  selectAllMetaEvidence('citation_author'),
);

export const gatherOpenGraphTags = collectFanout(
  selectMetaEvidence('og:url'),
  selectMetaEvidence('og:url', 'property'),
  selectMetaEvidence('og:title'),
  selectMetaEvidence('og:title', 'property'),
  selectMetaEvidence('og:type'),
  selectMetaEvidence('og:type', 'property'),
  selectMetaEvidence('og:description'),
  selectMetaEvidence('og:description', 'property'),
);

/// [dublinCore]
export const gatherDublinCoreTags = collectFanout(
  selectMetaEvidence('DC.Description'),
  selectMetaEvidence('DCTERMS.Abstract'),
  selectMetaEvidence('DC.Title'),
  selectAllMetaEvidence('DC.Creator'),
  selectAllMetaEvidence('DC.Subject'),
  selectAllMetaEvidence('DC.Identifier'),
  selectAllMetaEvidence('DC.Type'),
);
/// [dublinCore]

export const gatherSchemaEvidence = forInputs(
  /response-body/, compose(
    loadBrowserPage(),
    collectFanout(
      gatherHighwirePressTags,
      gatherOpenGraphTags,
      gatherDublinCoreTags,

      selectMetaEvidence('description'),
      selectElemTextEvidence('.abstract'),
      selectElemTextEvidence('#abstract'),
      selectElemTextEvidence('#Abstracts'),
      selectElemTextEvidence('.abstractInFull'),
    ),
  )
);
