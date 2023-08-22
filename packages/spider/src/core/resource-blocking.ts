import _ from 'lodash';
import { Logger } from 'winston';
import { PageInstance } from './browser-instance';

const AllBlockableResources = {
  cspviolationreport: null,
  document: null,
  eventsource: null,
  fetch: null,
  font: null,
  image: null,
  manifest: null,
  media: null,
  other: null,
  ping: null,
  preflight: null,
  script: null,
  stylesheet: null,
  signedexchange: null,
  texttrack: null,
  websocket: null,
  xhr: null,
  prefetch: null
};

type BlockableResources = typeof AllBlockableResources;
export type BlockableResource = keyof BlockableResources;

const BlockableResources: BlockableResource[] = _.keys(AllBlockableResources) as BlockableResource[];

export function blockedResourceReport(pageInstance: PageInstance, log: Logger): void {
  const allowed = pageInstance.opts.allowedResources;
  const ares = allowed.join(', ');
  const blocked = _.difference(BlockableResources, allowed);
  const bres = blocked.join(', ');
  log.debug('Resource permissions:');
  log.debug(`   Blocked: ${bres}`);
  log.debug(`   Allowed: ${ares}`);
}

export function allowResourceTypes(pageInstance: PageInstance, rs: BlockableResource[]): void {
  pageInstance.opts.allowedResources = rs;
}
export function currentlyBlockedResources(pageInstance: PageInstance): BlockableResource[] {
  return _.difference(BlockableResources, pageInstance.opts.allowedResources);
}
export function currentlyAllowedResources(pageInstance: PageInstance): BlockableResource[] {
  return pageInstance.opts.allowedResources;
}

export function blockResourceTypes(pageInstance: PageInstance, rs: BlockableResource[]): void {
  const allowed = _.difference(BlockableResources, rs);
  allowResourceTypes(pageInstance, allowed);
}

export interface BlockableUrl {
  regex: RegExp;
}

export interface RewritableUrl extends BlockableUrl {
  rewrite(inurl: string): string | undefined;
}

// TODO these might be better as configurations rather than hard-coded
export const RewritableUrls: RewritableUrl[] = [
  {
    regex: new RegExp('/arxiv.org/abs'),
    rewrite(srcUrl: string): string | undefined {
      const re = new RegExp('arxiv.org/abs/(.*)$');
      const matches = srcUrl.match(re);
      if (matches === null || matches.length < 2) return;
      const arxivId = matches[1];
      return `http://export.arxiv.org/api/query?id_list=${arxivId}`;
    }
  },
  {
    regex: new RegExp('/doi.org/.+/arXiv'),
    rewrite(srcUrl: string): string | undefined {
      const re = new RegExp('arXiv\.(.*)$');
      const matches = srcUrl.match(re);
      if (matches === null || matches.length < 2) return;
      const arxivId = matches[1];
      return `http://export.arxiv.org/api/query?id_list=${arxivId}`;
    }
  }
];
