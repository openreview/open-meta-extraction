import path from 'path';
import { shaEncodeAsHex } from './string-utils';

export interface HashEncodedPath {
  source: string;
  hashedSource: string;
  depth: number;
  leadingSegments: string[];
  toPath(): string;
}

export function makeHashEncodedPath(source: string, depth: number = 3): HashEncodedPath {
  const hashedSource = shaEncodeAsHex(source);
  const leadingSegments = hashedSource
    .slice(0, depth)
    .split('');

  return {
    source,
    hashedSource,
    depth,
    leadingSegments,
    toPath() {
      const leaf = `${hashedSource}.d`;
      return path.join(...leadingSegments, leaf);
    },
  };
}
