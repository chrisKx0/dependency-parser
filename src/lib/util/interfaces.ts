import { ReleaseType } from 'semver';

// array positions must be kept
export const PACKAGE_BUNDLES = ['@nx']; // @TODO add bundles like @angular, @nestjs when they are more robust

export enum ArgumentType {
  ALL_DEPENDENCIES = 'all-dependencies',
  COLLECT_METRICS = 'collect-metrics',
  EXCLUDE = 'exclude',
  FORCE = 'force',
  INCLUDE = 'include',
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

export enum Severity {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
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

export interface EvaluationResult {
  conflictState: ConflictState;
  metrics: Metrics;
}

export interface Heuristics {
  conflictPotential: number;
  isDirectDependency?: boolean;
  meanSize?: number;
  peers?: string[];
  pinnedVersion?: string;
  versionRange: VersionRange;
}

export interface Metrics {
  checkedDependencies: number;
  checkedPeers: number;
  checkedVersions: number;
  durationPreparation?: number;
  durationEvaluation?: number;
  resolvedPeers: number;
  resolvedPackages: number;
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

export type Edge = [string, string];
export type EdgeWithPeer = [string, string, boolean];

export type PackageSetEntry = [string, boolean];
export type PackageSet = PackageSetEntry[];
