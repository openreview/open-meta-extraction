import _ from 'lodash';
import path from 'path';
import fs from 'fs-extra';
import { throughFunc } from '~/util/stream-utils';
import { shaEncodeAsHex } from '~/util/string-utils';

export interface ExpandedDir {
  dir: string;
  files: string[];
}

export interface CorpusArtifact {
  corpusEntry: CorpusEntry;
  artifactType: string;
  path: string;
}

export interface CorpusEntry {
  entryId: string;
  path: string;
}

export function makeCorpusEntryLeadingPath(s: string): string {
  const sHash = shaEncodeAsHex(s);
  const leadingPath = sHash
    .slice(0, 2)
    .split('')
    .join('/');
  return leadingPath;
}

export function isValidCorpusEntryPath(s: string): boolean {
  const pathRE = /[0-9a-f]{40}\.d$/i;
  return pathRE.test(s);
}


export function expandDir(path: string): ExpandedDir {
  const dirEntries = fs.readdirSync(path, { withFileTypes: true });
  const files = dirEntries
    .filter(dirent => dirent.isFile())
    .map(dirent => dirent.name);

  const res: ExpandedDir = {
    dir: path,
    files,
  };
  return res;
}

export const expandDirTrans = throughFunc(expandDir);


const artifactSubdirO = {
  '.': null,
  'spidering-logs': null,
  'cache': null,
  'ground-truth': null,
  'extracted-fields': null,
};

type artifactSubdirT = typeof artifactSubdirO;
export type ArtifactSubdir = keyof artifactSubdirT;

const artifactSubdirs: ArtifactSubdir[] = [
  '.',
  'spidering-logs',
  'cache',
  'ground-truth',
  'extracted-fields',
];

export function resolveCorpusFile(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): string {
  return path.resolve(entryPath, artifactDir, corpusFilename);
}

export function ensureArtifactDir(entryPath: string, artifactDir: ArtifactSubdir): void {
  const artifactDirPath = path.resolve(entryPath, artifactDir);
  const artifactDirExists = fs.existsSync(artifactDirPath);
  if (artifactDirExists) return;

  fs.mkdirSync(artifactDirPath, { recursive: true });
}

export function cleanArtifactDir(entryPath: string): void {
  if (isValidCorpusEntryPath(entryPath)) {
    fs.rmSync(entryPath, { recursive: true, force: true });
    fs.mkdirSync(entryPath, { recursive: true });
  }
}
export function purgeArtifactDirs(entryPath: string): void {
  if (isValidCorpusEntryPath(entryPath)) {
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}


export function hasCorpusFile(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): boolean {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return fs.existsSync(filePath);
}

export function listCorpusArtifacts(entryPath: string, artifactDir: ArtifactSubdir): ExpandedDir {
  const p = path.resolve(entryPath, artifactDir);
  return expandDir(p);
}

export function readCorpusJsonFile<T>(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): T | undefined {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return readJsonOrUndef(filePath);
}

export function readCorpusJsonFileAsync<T>(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): Promise<T | undefined> {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return readJsonOrUndefAsync(filePath);
}

export function readCorpusTextFile(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): string | undefined {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return readTextOrUndef(filePath);
}

export function readCorpusTextFileAsync(entryPath: string, artifactDir: ArtifactSubdir, corpusFilename: string): Promise<string | undefined> {
  const filePath = path.resolve(entryPath, artifactDir, corpusFilename);
  return readTextOrUndefAsync(filePath);
}

export function writeCorpusJsonFile<T>(
  entryPath: string,
  artifactDir: ArtifactSubdir,
  filename: string,
  content: T,
  overwrite: boolean = false
): boolean {
  ensureArtifactDir(entryPath, artifactDir);
  const filePath = resolveCorpusFile(entryPath, artifactDir, filename);
  if (fs.existsSync(filePath) && overwrite) {
    fs.unlinkSync(filePath);
  }
  return writeJson(filePath, content);
}
export function writeCorpusTextFile(
  entryPath: string,
  artifactDir: ArtifactSubdir,
  filename: string,
  content: string,
  overwrite: boolean = false
): boolean {
  ensureArtifactDir(entryPath, artifactDir);
  const filePath = resolveCorpusFile(entryPath, artifactDir, filename);
  if (fs.existsSync(filePath) && overwrite) {
    fs.unlinkSync(filePath);
  }
  return writeText(filePath, content);
}

export function updateCorpusJsonFile<T = never>(
  entryPath: string,
  artifactDir: ArtifactSubdir,
  filename: string,
  modf: (prev?: T) => T
): void {
  ensureArtifactDir(entryPath, artifactDir);
  const artifactPath = resolveCorpusFile(entryPath, artifactDir, filename);
  const maybePrev = readJsonOrUndef<T>(artifactPath);
  const update = modf(maybePrev);
  const changed = !_.isEqual(maybePrev, update);
  if (changed) {
    if (maybePrev !== undefined) {
      fs.unlinkSync(artifactPath);
    }
    writeJson(artifactPath, update);
  }
}

function readJsonOrUndef<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return;
  return fs.readJsonSync(filePath);
}
async function readJsonOrUndefAsync<T>(filePath: string): Promise<T | undefined> {
  if (!fs.existsSync(filePath)) return;
  return fs.readJson(filePath);
}

export function writeJson<T>(filePath: string, obj: T): boolean {
  if (fs.existsSync(filePath)) return false;
  fs.writeJsonSync(filePath, obj);
  return true;
}

export function readTextOrUndef(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) return;
  return fs.readFileSync(filePath).toString();
}

async function readTextOrUndefAsync(filePath: string): Promise<string | undefined> {
  if (!fs.existsSync(filePath)) return;
  return fs.readFile(filePath).then(b => b.toString());
}

function writeText(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content);
  return true;
}

export function resolveEntryPath(entryPath: string, subPath: string): string {
  return path.resolve(entryPath, subPath);
}

export const ensureArtifactDirectories = (entryPath: string): void => {
  _.each(artifactSubdirs, d => {
    const artifactPath = resolveEntryPath(entryPath, d);
    const artifactDirExists = fs.existsSync(artifactPath);
    if (!artifactDirExists) {
      fs.mkdirSync(artifactPath, { recursive: true });
    }
  });
};
