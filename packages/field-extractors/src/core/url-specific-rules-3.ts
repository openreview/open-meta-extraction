import {
  Transform,
  ExtractionRule,
  collectFanout,
  compose,
  through,
} from '~/predef/extraction-prelude';

import {
  forInputs,
  saveEvidence,
  validateEvidence,
  urlFilter,
  selectElemTextEvidence,
} from './extraction-primitives';

import {
  dropN,
  grepDropUntil,
  grepFilter,
  grepFilterNot,
  grepTakeUntil,
  joinLines,
  loadTextFile,
  multiGrepDropUntil,
  multiGrepTakeUntil,
  splitLines,
} from './text-primitives';

import { gatherHighwirePressTags } from './headtag-scripts';


import {
  Elem,
  elemQueryOne,
  getElemAttr,
  getElemText,
  loadBrowserPage,
  selectOne
} from './html-query-primitives';


const removeHtmlTagsWithoutText: Transform<string[], string[]> = compose(
  grepFilterNot(/^[ ]*(<\/?\w{1,4}>[ ]*)+$/),
);


const selectNeuripsCCAbstract: Transform<string, unknown> = compose(
  splitLines,
  grepDropUntil(/Abstract/),
  dropN(1),
  grepTakeUntil(/^[ ]+<.div/),
  removeHtmlTagsWithoutText,
  joinLines(' '),
  saveEvidence('neurips.cc.abstract'),
);

export const neuripsCCRule: ExtractionRule = compose(
  urlFilter(/neurips.cc/),
  forInputs(/response-body/, compose(
    collectFanout(
      compose(loadBrowserPage(), gatherHighwirePressTags),
      compose(loadTextFile, selectNeuripsCCAbstract)
    ),
    validateEvidence({
      citation_title: 'title',
      citation_author: 'author',
      citation_pdf_url: 'pdf-link',
      'neurips.cc.abstract': 'abstract'
    }),
  ))
);

const selectIscaSpeechAbstract: Transform<Elem, void> = compose(
  elemQueryOne('p'),
  getElemText,
  saveEvidence('isca.abstract'),
);


const selectIscaSpeechTitle: Transform<Elem, void> = compose(
  elemQueryOne('h3'),
  getElemText,
  saveEvidence('isca.title'),
);

const selectIscaSpeechAuthors: Transform<Elem, void> = compose(
  elemQueryOne('h5'),
  getElemText,
  saveEvidence('isca.authors'),
);


const selectIscaSpeechPDFLink: Transform<Elem, void> = compose(
  elemQueryOne('a'),
  getElemAttr('href'),
  saveEvidence('pdf-link'),
);

export const iscaSpeechOrgRule: ExtractionRule = compose(
  urlFilter(/isca-speech.org/),
  forInputs(/response-body/, compose(
    loadBrowserPage(),
    selectOne('div.w3-card'),
    collectFanout(
      selectIscaSpeechAbstract,
      selectIscaSpeechAuthors,
      selectIscaSpeechPDFLink,
      selectIscaSpeechTitle,
    ),
    validateEvidence({
      title: 'title',
      authors: 'authors',
      'pdf-link?': 'pdf-link',
      'abstract': 'abstract',
    }),
  )),
);


const narrowToCol2TD: (re: RegExp) => Transform<string[], string[]> = (re) => compose(
  multiGrepDropUntil([/<t[dh]/, re], false),
  multiGrepDropUntil([/<t[dh]/], false),
  multiGrepTakeUntil([/<\/t[dh]>/], false),
);

const removeHtmlTags: Transform<string[], string[]> =
  grepFilterNot(/^[ ]+<.*>[ ]*$/);

const retainAnchorTag: Transform<string[], string[]> =
  grepFilter(/^[ ]+<a href=.*>[ ]*$/);

const getAnchorHref: Transform<string, string> =
  through((anchorTag) => {
    return anchorTag
      .replace(/^.*href="/, '')
      .replace(/".*$/, '')
  });

export const lrecConfOrg: ExtractionRule = compose(
  urlFilter(/lrec-conf.org/),
  forInputs(/response-body/, compose(
    loadTextFile,
    splitLines,
    collectFanout(
      compose(
        narrowToCol2TD(/Abstract/),
        removeHtmlTags,
        joinLines(' '),
        saveEvidence('abstract'),
      ),
      compose(
        narrowToCol2TD(/Title/),
        removeHtmlTags,
        joinLines(' '),
        saveEvidence('title'),
      ),
      compose(
        narrowToCol2TD(/Authors/),
        removeHtmlTags,
        joinLines(' '),
        saveEvidence('authors-block'),
      ),
      compose(
        narrowToCol2TD(/Full Paper/i),
        retainAnchorTag,
        joinLines(' '),
        getAnchorHref,
        saveEvidence('pdf-link'),
      ),
    ),
    validateEvidence({
      'abstract': 'abstract',
      'title': 'title',
      'authors-block': 'authors-block',
      'pdf-link?': 'pdf-link',
    }),
  )),
);

const selectCogsciMindmodelingAbstract: Transform<string, unknown> = compose(
  splitLines,
  grepDropUntil(/Abstract/),
  grepDropUntil(/^[ ]+<blockquote/),
  dropN(1),
  grepTakeUntil(/^[ ]+<.blockquote/),
  removeHtmlTagsWithoutText,
  joinLines(' '),
  saveEvidence('grepped.abstract'),
);

export const cogsciMindmodelingOrg: ExtractionRule = compose(
  urlFilter(/cogsci.mindmodeling.org/),
  forInputs(/response-body/, compose(
    collectFanout(
      compose(loadBrowserPage(), collectFanout(
        selectElemTextEvidence('#abstract'),
        selectElemTextEvidence('.subAbstract'),
      )),
      compose(loadTextFile, selectCogsciMindmodelingAbstract)
    ),
    validateEvidence({
      '#abstract?': 'abstract',
      '.subAbstract?': 'abstract',
      'grepped.abstract?': 'abstract',
    }),
  ))
);
