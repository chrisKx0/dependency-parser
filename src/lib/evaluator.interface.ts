export interface Result {
    name: string;
    version: string;
    level: number;
}

export type Versions = Record<string, string[]>;
export type Peers = Record<string, string>;
