# Open Meta Extraction

## Brief
A set  of services to spider  and extract metadata (abstracts,  titles, authors,
pdf links)  from given URLs.  Services may be  run individually as  command line
applications, or as service that runs on a schedule (using PM2)

## Overview
This project provides a set of services to take the URL of a webpage for a
research paper, and extract metadata for that paper. Metadata includes the
abstract, title, authors, and a URL for a PDF version of the paper. Spidering is
done using an automated Chrome browser. Once a URL is loaded into the browser, a
series of extraction rules are applied. The extractor checks for commonly used
metadata schemas, including Highwire Press, Dublin Core, OpenGraph, along with
non-standard variations of the most common schemas, and a growing list of
journal and domain-specific methods of embedding metadata in the head or body of
a webpage. Once a suitable schema is identified, the metadata fields are saved
to a local file system, then returned to the caller. If changes are made to the
spidering and/or extractor, such that re-running the system produces different
results, that fact is returned along with the results.
