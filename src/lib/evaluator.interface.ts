export interface ConflictState {
    result?: ResolvedPackage[] | PackageRequirement[];
    state: State;
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

export enum State {
    OK = 'OK',
    CONFLICT = 'CONFLICT',
}
