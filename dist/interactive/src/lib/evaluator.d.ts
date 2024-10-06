import { ArgumentsCamelCase } from 'yargs';
import { ArgsUnattended, ConflictState, PackageRequirement, RegistryClient, Metrics } from './util';
export declare class Evaluator {
    private readonly allowedMajorVersions;
    private readonly allowedMinorAndPatchVersions;
    private readonly allowPreReleases;
    private readonly pinVersions;
    private readonly force;
    private readonly client;
    private readonly heuristics;
    private metrics;
    private packageSets;
    constructor(allowedMajorVersions?: number, allowedMinorAndPatchVersions?: number, allowPreReleases?: boolean, pinVersions?: boolean, force?: boolean, client?: RegistryClient);
    prepare(args: ArgumentsCamelCase | ArgsUnattended, excludedPackages: string[]): Promise<PackageRequirement[]>;
    evaluate(openRequirements: PackageRequirement[]): Promise<{
        conflictState: ConflictState;
        metrics: Metrics;
    }>;
    private evaluationStep;
    private addDependenciesToOpenSet;
    private createHeuristics;
    private getVersionReference;
    private getVersionsInMinorAndPatchRange;
    /**
     * sorts the package requirements in place by heuristics
     * @param packageRequirements the package requirements to sort
     * @private
     */
    private sortByHeuristics;
    private getRangeBetweenVersions;
    private getPinnedVersions;
}
