import { ReleaseType } from 'semver';

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

// array positions must be kept
export const PACKAGE_BUNDLES = ['@nx', '@angular'];

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

export enum State {
  OK = 'OK',
  CONFLICT = 'CONFLICT',
}

export interface Versions {
  versions: string[];
  meanSize: number;
}

export interface VersionRange {
  type: ReleaseType;
  value: number;
}
