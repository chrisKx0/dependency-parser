import { ReleaseType } from 'semver';

// array positions must be kept
export const PACKAGE_BUNDLES = ['@nx', '@angular'];

export enum ArgumentType {
  ALL_DEPENDENCIES = 'all-dependencies',
  FORCE_REGENERATION = 'force-regeneration',
  INSTALL = 'install',
  MAJOR_VERSIONS = 'major-versions',
  MINOR_VERSIONS = 'minor-versions',
  MIGRATE = 'migrate',
  MODIFY_JSON = 'modify-json',
  PACKAGE_MANAGER = 'package-manager',
  PATH = 'path',
  KEEP_VERSIONS = 'keep-versions',
  PRE_RELEASE = 'pre-release',
  RETRY = 'retry',
  SKIP_PROMPTS = 'skip-prompts',
}

export enum State {
  OK = 'OK',
  CONFLICT = 'CONFLICT',
}

export interface ArgsUnattended {
  path: string;
}

export interface ConflictState {
  result?: ResolvedPackage[] | PackageRequirement[];
  state: State;
}

export interface Heuristics {
  conflictPotential: number;
  isDirectDependency?: boolean;
  meanSize?: number;
  peers?: string[];
  pinnedVersion?: string;
  versionRange: VersionRange;
}

export interface PackageDetails {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface PackageRequirement {
  name: string;
  versionRequirement?: string;
  peer?: boolean;
}

export interface ResolvedPackage {
  name: string;
  semVerInfo: string;
}

export interface Versions {
  versions: string[];
  meanSize: number;
}

export interface VersionRange {
  type: ReleaseType;
  value: number;
}
