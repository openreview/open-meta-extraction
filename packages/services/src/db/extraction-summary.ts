import _ from 'lodash';

import { subDays } from 'date-fns';
import { createDBModels } from './schemas';

interface BoolIDCounts {
  _id: boolean;
  count: number;
}

interface StrIDCounts {
  _id: string;
  count: number;
}

interface Total {
  total: number;
}

interface NoteStatusSummary {
  noteCount: Total[];
  updateByDay: StrIDCounts[];
  totalWithUrls: BoolIDCounts[];
  withUrlsByDomain: StrIDCounts[];
}

interface ExtractionStatusSummary {
  noteCount: Total[];
  updateByDay: StrIDCounts[];
  workflowStatus: StrIDCounts[];
  totalWithAbstracts: BoolIDCounts[];
  totalWithPdfLinks: BoolIDCounts[];
  withAbstractsByDomain: StrIDCounts[];
  withHttpStatusByDomain: StrIDCounts[];
}

type DomainPresentOrMissing = {
  domain: string,
  missing?: number,
  present?: number
};

type DomainCodeCounts = {
  domain: string,
  httpCode: string,
  count: number
};

function collateStrIDCounts(recs: StrIDCounts[]): string[] {
  return _.map(recs, ({ _id, count }) => {
    return `    ${_id}: ${count}`;
  });
};

function formatAbstractStatusByDomain(title: string, byDomain: StrIDCounts[]): string[] {
  const byDomain1: DomainPresentOrMissing[] = _.map(byDomain, ({ _id, count }) => {
    const [domain, hasAbstract] = _id.split('__');
    if (hasAbstract === 'true') {
      return { domain, present: count, missing: 0 };
    }
    return { domain, present: 0, missing: count };
  });


  const groupedByDomain = _.values(_.groupBy(byDomain1, (r) => r.domain));

  const countedByDomain = _.map(groupedByDomain, (domains) => {
    const domainName = domains[0].domain;
    const empty: Required<DomainPresentOrMissing> = { domain: domainName, missing: 0, present: 0 };
    _.each(domains, d => {
      empty.missing += d.missing || 0;
      empty.present += d.present || 0;
    });
    return empty;
  });

  const [withAllPresent, withSomeMissing] = _.partition(countedByDomain, d => d.missing === 0);
  const [withAllMissing, withSomePresent] = _.partition(withSomeMissing, d => d.present === 0);


  function sort(recs: Required<DomainPresentOrMissing>[]): Required<DomainPresentOrMissing>[] {
    return _.sortBy(recs, r => -(r.missing + r.present));
  }

  const allPresentAsStrings = _.map(sort(withAllPresent), (rec) => {
    const { present } = rec;
    return `    ${present}: ${rec.domain}`;
  });
  const allMissingAsStrings = _.map(sort(withAllMissing), (rec) => {
    const { present, missing } = rec;
    return `    0/${present + missing}: ${rec.domain}`;
  });
  const somePresentAsStrings = _.map(sort(withSomePresent), (rec) => {
    const { present, missing } = rec;
    return `    ${present}/${present + missing}: ${rec.domain}`;
  });

  return [
    title,
    'Fully Successful Domains',
    ...allPresentAsStrings,
    'Partially Successful Domains',
    ...somePresentAsStrings,
    'Failed Domains',
    ...allMissingAsStrings,
  ];
}

function formatHttpStatusByDomain(byDomain: StrIDCounts[]): string[] {
  const byDomain1: DomainCodeCounts[] = _.map(byDomain, ({ _id, count }) => {
    const [domain, httpCode] = _id.split('__');
    return { domain, httpCode, count };
  });

  const groupedByDomain = _.values(_.groupBy(byDomain1, (r) => r.domain));

  const allCodesByDomain = _.map(groupedByDomain, (domainRecs) => {
    const domainName = domainRecs[0].domain;
    const codeCounts: Record<string, number> = {
      '20x': 0,
      '30x': 0,
      '40x': 0,
      '50x': 0,
    };
    _.each(domainRecs, rec => {
      const { httpCode, count } = rec;
      _.update(codeCounts, httpCode, (prev) => prev + count);
    });
    const codeCountStrs = _.join(_.map(
      _.toPairs(codeCounts), ([code, count]) => {
        const countstr = _.padEnd(count.toString(), 6);
        return `${code}: ${countstr}`;
      }
    ), '');
    const domainstr = _.padEnd(domainName, 35);
    return `${domainstr}: ${codeCountStrs}`;
  });

  return ['Http Status Counts By Domain', ...allCodesByDomain];
}


// export async function showStatusSummary(): Promise<string[][]> {
//   const daysAgo7 = subDays(new Date(), 7);
//   const selectOneWeek = {
//     $match: {
//       updatedAt: {
//         $gte: daysAgo7
//       },
//     }
//   };

//   const groupByUpdateDay = {
//     $group: {
//       _id: {
//         $dateToString: {
//           format: '%Y-%m-%d',
//           date: '$updatedAt',
//         }
//       },
//       count: {
//         $sum: 1
//       },
//     }
//   };
//   const groupByHaveAbs = {
//     $group: {
//       _id: '$hasAbstract',
//       count: {
//         $sum: 1
//       },
//     }
//   };
//   const groupByHavePdfLinks = {
//     $group: {
//       _id: '$hasPdfLink',
//       count: {
//         $sum: 1
//       },
//     }
//   };

//   const groupByHaveUrl = {
//     $group: {
//       _id: '$validUrl',
//       count: {
//         $sum: 1
//       },
//     }
//   };

//   const selectValidResponse = {
//     $match: {
//       validResponseUrl: true,
//     }
//   };

//   const groupByDomainHasAbstract = {
//     $group: {
//       _id: {
//         $concat: [
//           '$responseHost', '__', { $toString: '$hasAbstract' }
//         ]
//       },
//       count: {
//         $sum: 1
//       },
//     }
//   };

//   const groupByWorkflowStatus = {
//     $group: {
//       _id: '$workflowStatus',
//       count: {
//         $sum: 1
//       },
//     }
//   };

//   const groupByDomainHttpStatus = {
//     $group: {
//       _id: {
//         $concat: [
//           '$responseHost', '__', { $concat: [{ $substr: [{ $toString: '$httpStatus' }, 0, 1] }, '0x'] }
//         ]
//       },
//       count: {
//         $sum: 1
//       },
//     }
//   };

//   const count = { $count: 'total' };

//   const dbModels = createDBModels();

//   const noteStatusRes = await dbModels.noteStatus.aggregate([{
//     $facet: {
//       noteCount: [count],
//       updateByDay: [selectOneWeek, groupByUpdateDay, { $sort: { _id: 1 } }],
//       totalWithUrls: [groupByHaveUrl],
//     }
//   }]);

//   const noteStatusSummary: NoteStatusSummary = noteStatusRes[0];

//   const res = await dbModels.urlStatus.aggregate([{
//     $facet: {
//       noteCount: [count],
//       updateByDay: [selectOneWeek, groupByUpdateDay, { $sort: { _id: 1 } }],
//       totalWithAbstracts: [groupByHaveAbs],
//       totalWithPdfLinks: [groupByHavePdfLinks],
//       workflowStatus: [groupByWorkflowStatus],
//       withAbstractsByDomain: [selectValidResponse, groupByDomainHasAbstract, { $sort: { _id: 1 } }],
//       withHttpStatusByDomain: [selectValidResponse, groupByDomainHttpStatus, { $sort: { _id: 1 } }],
//     }
//   }]);

//   const urlStatusSummary: ExtractionStatusSummary = res[0];

//   const noteCount = noteStatusSummary.noteCount.length === 0 ? 0 : noteStatusSummary.noteCount[0].total;

//   const updateByDayMessage: string[] = [
//     'Updated Notes Per Day, Last 7 days',
//     ..._.map(urlStatusSummary.updateByDay, ({ _id, count }) => {
//       return `    ${_id}: ${count}`;
//     })
//   ];


//   const totalWithAbstractsMessage: string[] = _.flatMap(urlStatusSummary.totalWithAbstracts, ({ _id, count }) => {
//     return _id ? [`Notes With Abstracts: ${count}`] : [];
//   });
//   const totalWithPdfLinkMessage: string[] = _.flatMap(urlStatusSummary.totalWithPdfLinks, ({ _id, count }) => {
//     return _id ? [`Notes With PDF Links: ${count}`] : [`Notes Without PDF Links: ${count}`];
//   });

//   const totalWithUrlsMessage = _.flatMap(noteStatusSummary.totalWithUrls, ({ _id, count }) => {
//     return _id ? [`Notes With Valid URL Field (content.html): ${count}`] : [];
//   });

//   const absByDomainMessages = formatAbstractStatusByDomain(
//     'Extracted Abstracts By Domain, out of Notes with valid URLs',
//     urlStatusSummary.withAbstractsByDomain
//   );

//   const httpStatusByDomainMessages = formatHttpStatusByDomain(urlStatusSummary.withHttpStatusByDomain);
//   const workflowStatus = [
//     'Workflow Status Counts',
//     ...collateStrIDCounts(urlStatusSummary.workflowStatus)
//   ];

//   return [
//     [`Recorded Note Count: ${noteCount}`,],
//     totalWithUrlsMessage,
//     totalWithAbstractsMessage,
//     totalWithPdfLinkMessage,
//     updateByDayMessage,
//     absByDomainMessages,
//     httpStatusByDomainMessages,
//     workflowStatus
//   ];
// }

export function formatStatusMessages(msgs: string[][]): string {
  return _.map(msgs, m => m.join('\n')).join('\n\n');
}
