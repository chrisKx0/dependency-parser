import { ArgumentsCamelCase } from 'yargs';
import { ArgsUnattended, PackageRequirement, RegistryClient, EvaluationResult } from './util';
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
    /**
     * prepares the first set of open requirements by retrieving them from package.json or command line.
     * heuristics will be created for these open requirements too
     * @param args command line arguments
     * @param excludedPackages packages to exclude from preparation
     * @param includedPackages packages that are allowed as initial open requirements
     */
    prepare(args: ArgumentsCamelCase | ArgsUnattended, excludedPackages: string[], includedPackages: string[]): Promise<{
        openRequirements: PackageRequirement[];
        additionalPackagesToInstall: string[];
    }>;
    /**
     * performs evaluation for open requirements
     * @param openRequirements initial open requirements of the evaluation
     */
    evaluate(openRequirements: PackageRequirement[]): Promise<EvaluationResult>;
    /**
     * step of the evaluation in which a version for the next open requirement is selected
     * @param selectedPackageVersions the already selected peer dependency versions
     * @param closedRequirements all already closed requirements
     * @param openRequirements open requirements that are still open
     * @param edges edges between the requirements for backtracking purposes
     * @private
     */
    private evaluationStep;
    /**
     * updates the open requirements with new dependencies of the current package
     * @param packageDetails details of the current package with peer dependencies and dependencies
     * @param closedRequirements the already closed requirements
     * @param openRequirements the current open requirements
     * @param edges all edges between packages, that have been seen
     * @private
     */
    private addDependenciesToOpenSet;
    /**
     * creates new heuristic entry for a package if not already existing
     * @param name package name
     * @param pinnedVersion pinned version of package (optional)
     * @param isDirectDependency if the package is a direct dependency
     * @private
     */
    private createHeuristics;
    /**
     * find a reasonable reference version that is not more than 1 away from its predecessor
     * @param versions all versions that possible
     * @param func compare function for versions (major, minor or patch)
     * @private
     */
    private getVersionReference;
    /**
     * get filtered versions that are in the allowed range of minor and patch versions
     * @param versions versions to filter
     * @private
     */
    private getVersionsInMinorAndPatchRange;
    /**
     * sorts the package requirements in place by heuristics
     * @param packageRequirements the package requirements to sort
     * @private
     */
    private sortByHeuristics;
    /**
     * get range between versions with type (major, minor, patch) and value (versions of type between them)
     * @param versions versions to get maximum range of
     * @private
     */
    private getRangeBetweenVersions;
    /**
     * get pinned versions declared in command line parameter or package.json
     * @param params command line parameters including packages to install
     * @param dependencies dependencies specified in package.json
     * @private
     */
    private getPinnedVersions;
}
