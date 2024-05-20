export interface Result {
    name: string;
    version: string;
    level: number;
}

export type Versions = Record<string, string[]>;
export type Peers = Record<string, string>;

// new interfaces
export interface PackageRequirement {
    name: string;
    versionRequirement?: string;
    peer?: boolean;
}

export interface ResolvedPackage {
    name: string;
    semVerInfo: string;
}
