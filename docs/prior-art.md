
# Overview
Many spidering and web  page scrapers exist, both open source  and paid, as well
as SaaS  solutions. It is  important to  consider whether another  data scraping
system is warranted. The  author of this system is familiar  with, and has used,
many available systems, and has evaluted many more as candidates to provide this
service.

Many  available  systems provide  extensive  support  for page  crawling,  i.e.,
traversing  links to  explore a  collection of  pages, but  limited support  for
extraction, often nothing  more than a function  hook that runs when  a page has
been retrieved. Some provide a declarative  syntax for specifying CSS queries to
retrieve identifiable elements on a page,  but fall short when those queries are
not powerful enough.

Given that  this system requires  only the  simplest crawler (all  required page
URLs  are given  directly), but  benefits  from a  large and  extensible set  of
scraping  procedures, the  path of  least resistance  was to  avoid the  pain of
integrating with  an existing system,  provide the  web page retrieval  using an
existing product (Puppeteer controlling a  Chrome browser), and focus on writing
simple, composable primitives to support the extraction process.


