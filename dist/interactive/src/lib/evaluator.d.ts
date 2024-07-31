import { ArgumentsCamelCase } from 'yargs';
import { ArgsUnattended, ConflictState, PackageRequirement } from './interfaces';
export declare class Evaluator {
    private readonly allowedMajorVersions;
    private readonly allowPreReleases;
    private readonly pinVersions;
    private readonly forceRegeneration;
    private readonly client;
    private readonly heuristics;
    private directDependencies;
    constructor(allowedMajorVersions?: number, allowPreReleases?: boolean, pinVersions?: boolean, forceRegeneration?: boolean);
    prepare(args: ArgumentsCamelCase | ArgsUnattended): Promise<PackageRequirement[]>;
    evaluate(openRequirements: PackageRequirement[]): Promise<ConflictState>;
    private evaluationStep;
    private addDependenciesToOpenSet;
    private createHeuristics;
    private sortByHeuristics;
    private getRangeBetweenVersions;
    private getPinnedVersions;
}
