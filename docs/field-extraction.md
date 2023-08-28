# Overview
The  field extraction  module contains  both  the low-level  building blocks  to
extract data  from web  documents, and  a collection  of higher  level functions
tailored for specific domains. It has been designed with the expectation
that these domain-specific rules will be regularly added.

The low-level API includes primitives for CSS selector queries,
XPath XML queries, and text-based search.

# Extraction Primitives

## CSS-Selector primitives
The simplest  method for  extracting data  from html/xml is  using CSS  or XPath
query selectors, if the relevant information is accessible through such means.


For example, given a document with an element like this:
```html
<div class="movie">
  <span class="title">Dead Poet's Society</span>
  <span class="year" value="1985" />
</div>
```
We can get the title and year with functions like these:
```typescript
const getTitle = compose(
  selectOne('div.movie'),
  elemQueryOne('span.title'),
  getElemText()
);

const getYear = compose(
  selectOne('div.movie),
  elemQueryOne('span.year'),
  getElemAttr('value')
);
```

CSS-style query selectors are defined here:
[html-query-primitives.ts](packages/field-extractors/src/core/html-query-primitives.ts)


### Case sensitivity in attribute queries
When  selecting a  tag with  a selector  that relies  on a  particular attribute
value,  e.g.,  query=`'meta[name=DC.Creator]'`  to find  elements  like:  `<meta
name="DC.Creator" content="Frank  Jones" />`  it is important  to note  that the
attribute value in the query ('DC.Creator'  in this example), is case sensitive.
Documents are inconsistent, and may  include variations like `name="creator"` or
`name="Creator"`. The correct formulation of a  query string that would find all
of these variations is the unwieldy:

```typescript
queryOne('meta[name=DC.Creator],meta[name=Dc.Creator],meta[name=dc.creator]')
```

The function `expandCaseVariations()` is provided to generate the usual case variations for an attribute name .
```typescript
const queryString = expandCaseVariations('DC.Creator', (s) => `meta[name=${n}]` );
// queryString == 'meta[name=DC.Creator],meta[name=Dc.Creator],meta[name=dc.creator]'
const elem = queryOne(queryString);
```


## Text-based Primitives
When an HTML page is constructed such that it does not have any CSS-selectors to reliably pick out a field,
we can sometimes search through lines of text, matching, filtering and skipping lines to narrow down to
the block of text that we need.

Here is an example that tries to pull out an abstract:

```typescript
const selectNeuripsCCAbstract: Transform<string, string> = compose(
  splitLines,
  grepDropUntil(/Abstract/),
  dropN(1),
  grepTakeUntil(/^[ ]+<.div/),
  removeHtmlTagsWithoutText,
  joinLines(' '),
);
```

Text-based primitives are defined in
`📄 packages/field-extractors/src/core/text-primitives.ts`

### HTML Normalization
To make  text-based extraction easier  and more reliable, downloaded  HTML pages
are normalized though HTMLTidy before attempting extraction. The configuration
for HTMLTidy is here:
`📄 packages/services/conf/tidy.cfg`


# High level extraction rules

## Standard Metadata Formats
Many  documents  include header  tags  formatted  according  to one  of  several
standards, including  Highwire Press,  OpenGraph, DublinCore, as  well as  a few
non-standard variations of each of those.

Functions to deal with these formats are defined in
`📄 packages/field-extractors/src/core/headtag-scripts.ts`


## URL-Specific and Generic Rules
Particular hosting sites often have standardized formats for web page
structure, either a known metadata schema or a common set of class names or
ids on elements. Many have an ad-hoc mixture of data formats.

Many examples of URL-specific rules may be found in these files:
`📄 packages/field-extractors/src/core/url-specific-rules-1.ts`
`📄 packages/field-extractors/src/core/url-specific-rules-2.ts`
`📄 packages/field-extractors/src/core/url-specific-rules-3.ts`

They are all aggregated into a single pipeline here:
`📄 packages/field-extractors/src/core/url-specific-rules.ts`

The full end-to-end spider-to-extraction pipeline is defined here:
`📄 packages/field-extractors/src/core/extraction-rules.ts `

# Field candidate selection
# Browser redirection, JavaScript enabling, and other Browser directives
Some pages require JavaScript to run before the metadata is available. In other cases,
spidering is strictly prohibited on the given domain for the research paper, but a secondary
domain is provided which allows the data to be collected. Notably, arXiv.org provides an XML
service at https://export.arxiv.org/. For these purposes, rules may specify which resources to block and which to
allow when fetching pages, and can hook into browser events

# Control-flow abstractions

## Scatter/gather

## Browser redirection
