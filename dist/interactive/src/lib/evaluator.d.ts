import { ArgumentsCamelCase } from 'yargs';
import { ArgsUnattended, ConflictState, PackageRequirement } from './util';
export declare class Evaluator {
    private readonly allowedMajorVersions;
    private readonly allowedMinorAndPatchVersions;
    private readonly allowPreReleases;
    private readonly pinVersions;
    private readonly forceRegeneration;
    private readonly client;
    private readonly heuristics;
    private directDependencies;
    constructor(allowedMajorVersions?: number, allowedMinorAndPatchVersions?: number, allowPreReleases?: boolean, pinVersions?: boolean, forceRegeneration?: boolean);
    prepare(args: ArgumentsCamelCase | ArgsUnattended): Promise<PackageRequirement[]>;
    evaluate(openRequirements: PackageRequirement[]): Promise<ConflictState>;
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
