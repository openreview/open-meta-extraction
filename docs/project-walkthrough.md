---
id: s9aig
name: Project Walkthrough
file_version: 1.1.0
app_version: 1.0.6
---

<!-- Intro - Do not remove this comment -->
## Overview

OpenMetaExtraction  is a  service provider  for OpenReview.net.  Its goal  is to
retrieve the  details of academic  research papers (e.g., abstracts,  PDF links,
authorship links), given the landing page  URLs for those papers. It consists of
a spidering package to retrieve and query a web page, an extensible set of rules
to  scrape  the metadata,  and  a  service  module  to handle  scheduled  tasks,
communication with OpenReview , and monitoring during deployment.

The system consists of four packages:

- Spider, A collection of utilities to navigate URLs using a headless browser
- FieldExtractors, A set of functions to scrape information from HTML, XML, JSon
- CommonLib, which defines the basic control-flow abstractions and shared utilities
- Services, Integration for Spider and FieldExtractors with OpenReview; local DB and deployment configuration
- Root, which contains shared project configurations

## Requirements
- Import new URLs from OpenReview on a regular schedule
- Retrieve metadata for each imported URL, and post it back to OpenReview
- Deliver daily report on extraction process


1. [Spider/scraper](spiderscraper.ya137.sw.md)
2. [Field Extraction](field-extraction.3g09c.sw.md)
3. [Adding a URL-specific Rule](adding-a-url-specific-rule.cg8jn.sw.md)
4. [Common Utils](common-utils.rznrj.sw.md)
5. [Service Installation](service-installation.g9lpd.sw.md)
6. [Command-line Usage](command-line-usage.rz1dn.sw.md)
7. [Prior Art](prior-art.f05pj.sw.md)


