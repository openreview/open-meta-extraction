/**
 * URL-Specific rules for gathering metadata from html/xml
 *
 * Rules are broken out into separate files just for organization,
 * and to avoid overly long files
 **/

import _ from 'lodash';

import {
  eachOrElse,
  ExtractionRule,
  Transform,
  forEachDo,
  through,
  ClientFunc,
  collectFanout,
  CacheFileKey,
  compose,
} from '~/predef/extraction-prelude';

import {
  forInputs,
  selectElemTextEvidence,
  validateEvidence,
  urlFilter,
  saveEvidence,
  withResponsePage,
  selectCombinedElemTextEvidence
} from '~/core/extraction-primitives';

import {
  grepFilter,
  loadTextFile,
  splitLines,
} from '~/core/text-primitives';

import {
  gatherHighwirePressTags,
  gatherOpenGraphTags,
} from './headtag-scripts';

import {
  BrowserPage,
  getElemText,
  selectOne
} from './html-query-primitives';

type ParsedJson = {
  json: any
}

// Springer documents have JSon embedded as a string within <script> tags,
// this will attempt to locate and parse it
const readSpringerDocumentMetadata: Transform<BrowserPage, ParsedJson> = compose(
  selectOne('script[type="application/ld+json"]'),
  getElemText,
  through((jsonText, env) => {
    if (!_.isString(jsonText) || jsonText.length === 0) {
      return ClientFunc.failWith('springer-link.metadata not found');
    }
    const i1 = jsonText.indexOf('{');
    const i2 = jsonText.lastIndexOf('}');
    if (i1 < 0 || i2 < 0) {
      return ClientFunc.failWith('springer-link.metadata doesnt look like json');
    }
    const strippedJson = jsonText.slice(i1, i2 + 1);
    try {
      return { json: JSON.parse(strippedJson) };
    } catch (error) {
      env.log.warn('readSpringerDocumentMetadata: Could not parse JSON text');
      return ClientFunc.failWith('springer-link.metadata not parsable');
    }
  }, 'readSpringerMetadata'));

const saveMetaDataEvidence: (name: string, f: (m: ParsedJson) => string[]) => Transform<ParsedJson, unknown> =
  (name, f) => compose(
    through((documentMetadata) => f(documentMetadata), `saveAnyMetaEvidence(${name})`),
    forEachDo(
      saveEvidence(name),
    )
  );

const selectSpringerDocumentMetaEvidence: () => Transform<BrowserPage, unknown> =
  () => compose(
    readSpringerDocumentMetadata,
    collectFanout(
      saveMetaDataEvidence('metadata:title', ({ json }) => json.headline ? [json.headline] : []),
      saveMetaDataEvidence('metadata:abstract', ({ json }) => json.description ? [json.description] : []),
      saveMetaDataEvidence('metadata:author', ({ json }) => json.author && _.isArray(json.author) ? json.author.map((a: any) => a.name) : []),
    )
  );

export const linkSpringerComRule: ExtractionRule = compose(
  urlFilter(/link.springer.com/),
  withResponsePage(compose(
    collectFanout(
      gatherHighwirePressTags,
      gatherOpenGraphTags,
      selectElemTextEvidence('section#Abs1 > p.Para'),
      selectCombinedElemTextEvidence('#body div.content'),
      compose(
        selectSpringerDocumentMetaEvidence(),
        validateEvidence({
          'metadata:title': 'title',
          'metadata:abstract': 'abstract',
          'metadata:author?': 'author',
        }),
      ),
    ),
    eachOrElse(
      compose(
        urlFilter(/\/chapter\//),
        validateEvidence({ // link.springer.com/chapter
          citation_title: 'title',
          citation_author: 'author',
          citation_pdf_url: 'pdf-link',
          'og:description': 'abstract-clipped',
          'section#Abs1 > p.Para': 'abstract',
        }),
      ),
      compose(
        urlFilter(/\/referenceworkentry\//),
        validateEvidence({
          citation_title: 'title',
          citation_author: 'author',
          citation_pdf_url: 'pdf-link',
          'og:description': 'abstract-clipped',
          '#body div.content': 'abstract',
        }),
      ),
      compose(
        urlFilter(/\/article\//),
        validateEvidence({ // link.springer.com/article
          citation_title: 'title',
          citation_author: 'author',
          citation_pdf_url: 'pdf-link',
          'og:description': 'abstract',
        }),
      ),
    )
  )),
);


interface GlobalDocumentMetadata {
  title?: string;
  abstract?: string;
  authors?: Author[];
  pdfPath?: string;
}

interface Author {
  name: string;
  firstName: string;
  lastName: string;
  affiliation: string;
}

const readGlobalDocumentMetadata: Transform<CacheFileKey, GlobalDocumentMetadata> = compose(
  loadTextFile,
  splitLines,
  grepFilter(/global\.document\.metadata/i),
  through((lines) => {
    if (lines.length === 0) {
      return ClientFunc.failWith('global.document.metadata not found');
    }
    const line = lines[0];
    const jsonStart = line.indexOf('{');
    const jsonEnd = line.lastIndexOf('}');
    const lineJson = line.slice(jsonStart, jsonEnd + 1);
    const globalMetadata: GlobalDocumentMetadata = JSON.parse(lineJson);
    return globalMetadata;
  }, 'readGlobalMetadata'));


const saveDocumentMetaDataEvidence: (name: string, f: (m: GlobalDocumentMetadata) => string[]) =>
  Transform<GlobalDocumentMetadata, unknown> = (name, f) =>
    compose(
      through((documentMetadata) => f(documentMetadata), `saveMetaEvidence(${name})`),
      forEachDo(
        saveEvidence(name),
      ),
    );

const selectGlobalDocumentMetaEvidence: () => Transform<CacheFileKey, unknown> = () => compose(
  readGlobalDocumentMetadata,
  collectFanout(
    saveDocumentMetaDataEvidence('metadata:title', m => m.title ? [m.title] : []),
    saveDocumentMetaDataEvidence('metadata:abstract', m => m.abstract ? [m.abstract] : []),
    saveDocumentMetaDataEvidence('metadata:pdf-link', m => m.pdfPath ? [m.pdfPath] : []),
    saveDocumentMetaDataEvidence('metadata:author', m => m.authors && _.isArray(m.authors) ? m.authors.map(a => a.name) : []),
  )
);


export const ieeExploreOrgRule: ExtractionRule = compose(
  urlFilter(/ieeexplore.ieee.org/),
  forInputs(/response-body/, compose(
    selectGlobalDocumentMetaEvidence(),
    validateEvidence({
      'metadata:title': 'title',
      'metadata:abstract': 'abstract',
      'metadata:author?': 'author',
      'metadata:pdf-link?': 'pdf-link',
    }),
  )),
);
