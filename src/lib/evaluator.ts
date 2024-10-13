import { compareVersions, satisfies } from 'compare-versions';
import * as fs from 'fs';
import { uniq } from 'lodash';
import { PackageJson } from 'nx/src/utils/package-json';
import * as process from 'process';
import { diff, major, minor, patch, SemVer, validRange } from 'semver';
import semver from 'semver/preload';
import toposort from 'toposort';
import { ArgumentsCamelCase } from 'yargs';

import {
  ArgsUnattended,
  ArgumentType,
  ConflictState,
  Edge,
  Heuristics,
  PACKAGE_BUNDLES,
  PackageDetails,
  PackageRequirement,
  ResolvedPackage,
  RegistryClient,
  State,
  VersionRange,
  EdgeWithPeer,
  PackageSet,
  Metrics,
  EvaluationResult,
} from './util';

/**
 * checks if args are of type ArgumentsCamelCase
 * @param args args of type ArgumentsCamelCase or ArgsUnattended
 */
function isArgumentsCamelCase(args: ArgumentsCamelCase | ArgsUnattended): args is ArgumentsCamelCase {
  return !!(args as ArgumentsCamelCase)._;
}

export class Evaluator {
  private readonly heuristics: Record<string, Heuristics> = {};
  private metrics: Metrics = {
    checkedDependencies: 0,
    checkedPeers: 0,
    checkedVersions: 0,
    resolvedPackages: 0,
    resolvedPeers: 0,
  };
  private packageSets: PackageSet[] = [];

  constructor(
    private readonly allowedMajorVersions = 2,
    private readonly allowedMinorAndPatchVersions = 10,
    private readonly allowPreReleases = true,
    private readonly pinVersions = false,
    private readonly force = false,
    private readonly client = new RegistryClient(),
  ) {}

  /**
   * prepares the first set of open requirements by retrieving them from package.json or command line.
   * heuristics will be created for these open requirements too
   * @param args command line arguments
   * @param excludedPackages packages to exclude from preparation
   * @param includedPackages packages that are allowed as initial open requirements
   */
  public async prepare(
    args: ArgumentsCamelCase | ArgsUnattended,
    excludedPackages: string[],
    includedPackages: string[],
  ): Promise<PackageRequirement[]> {
    // get package.json path from args or current working directory
    const path = ((args[ArgumentType.PATH] as string) ?? process.cwd()) + '/package.json';

    // read package.json to retrieve dependencies and peer dependencies and add them to open requirements
    const packageJson: PackageJson = JSON.parse(fs.readFileSync(path, { encoding: 'utf8' }));
    let openRequirements: PackageRequirement[] = [
      ...(packageJson.peerDependencies
        ? Object.keys(packageJson.peerDependencies).map((name) => ({
            name,
            peer: true,
          }))
        : []),
      ...(packageJson.dependencies
        ? Object.keys(packageJson.dependencies).map((name) => ({
            name,
            peer: false,
          }))
        : []),
    ];

    // exclude packages that are specified in excludedPackages
    openRequirements = openRequirements.filter((pr) => !excludedPackages.some((ep) => new RegExp(ep).test(pr.name)));

    // include only packages that are specified in includedPackages
    if (includedPackages.length) {
      openRequirements = openRequirements.filter((pr) => includedPackages.some((ep) => new RegExp(ep).test(pr.name)));
    }

    // load cache from file system
    this.client.readDataFromFiles();

    // get pinned versions for packages from command or package.json, if specified
    const dependencies = openRequirements.reduce(
      (acc, curr) => ({ ...acc, [curr.name]: packageJson.peerDependencies?.[curr.name] ?? packageJson.dependencies?.[curr.name] }),
      {},
    );
    const pinnedVersions: Record<string, string> = isArgumentsCamelCase(args) ? await this.getPinnedVersions(args._, dependencies) : {};

    // add heuristics for direct dependencies & pinned versions if needed
    for (const { name } of openRequirements) {
      await this.createHeuristics(name, pinnedVersions[name], true);
    }
    for (const [name, pinnedVersion] of Object.entries(pinnedVersions)) {
      await this.createHeuristics(name, pinnedVersion);
      // add missing pinned versions to open requirements --> packages the user explicitly installs
      const openRequirement = openRequirements.find((pr) => pr.name === name);
      if (openRequirement) {
        openRequirement.versionRequirement = pinnedVersion;
      } else {
        openRequirements.push({ name, peer: false, versionRequirement: pinnedVersion });
      }

      // @TODO: make package bundles more robust
      // edit bundled packages to also be of the same version
      openRequirements
        .filter((pr) => PACKAGE_BUNDLES.some((pb) => pr.name.startsWith(pb) && name.startsWith(pb)))
        .forEach((pr) => (pr.versionRequirement = pinnedVersion));
    }

    openRequirements = this.sortByHeuristics(openRequirements);

    // save cache to disk
    this.client.writeDataToFiles();

    return openRequirements;
  }

  /**
   * performs evaluation for open requirements
   * @param openRequirements initial open requirements of the evaluation
   */
  public async evaluate(openRequirements: PackageRequirement[]): Promise<EvaluationResult> {
    // call first evaluation step with only open requirements
    const conflictState = await this.evaluationStep([], [], openRequirements, []);
    // save cache to disk
    this.client.writeDataToFiles();
    return { conflictState, metrics: this.metrics };
  }

  /**
   * step of the evaluation in which a version for the next open requirement is selected
   * @param selectedPackageVersions the already selected peer dependency versions
   * @param closedRequirements all already closed requirements
   * @param openRequirements open requirements that are still open
   * @param edges edges between the requirements for backtracking purposes
   * @private
   */
  private async evaluationStep(
    selectedPackageVersions: ResolvedPackage[],
    closedRequirements: PackageRequirement[],
    openRequirements: PackageRequirement[],
    edges: EdgeWithPeer[],
  ): Promise<ConflictState> {
    if (openRequirements.length) {
      const currentRequirement = openRequirements.shift();

      // check for fixed versions
      let version = currentRequirement.peer && selectedPackageVersions.find((rp) => rp.name === currentRequirement.name)?.semVerInfo;

      // @TODO: make package bundles more robust
      if (!version) {
        // bundled packages need to be of the same version
        version = selectedPackageVersions.find((rp) =>
          PACKAGE_BUNDLES.some((pb) => rp.name.startsWith(pb) && currentRequirement.name.startsWith(pb)),
        )?.semVerInfo;
      }

      let availableVersions: string[];

      // available versions include either the fixed version only or all versions from npm registry in descending order
      if (version) {
        availableVersions = [version];
      } else {
        availableVersions = (await this.client.getAllVersionsFromRegistry(currentRequirement.name)).versions
          .sort(compareVersions)
          .reverse();
      }

      // if the package has a pinned version, check if its valid and filter available version by it
      const pinnedVersion = this.heuristics[currentRequirement.name].pinnedVersion;
      if (validRange(pinnedVersion)) {
        availableVersions = availableVersions.filter((v) => v && satisfies(v, pinnedVersion));
      }

      // if version requirement is no valid requirement, remove it entirely
      // @TODO: handle versions that are urls or prefixed: with npm:, file:, etc.
      const versionRequirement = validRange(currentRequirement.versionRequirement);
      if (!versionRequirement) {
        delete currentRequirement.versionRequirement;
      }

      // find a reasonable reference version
      const versionReference = this.getVersionReference(availableVersions, major);

      let compatibleVersions =
        versionRequirement && versionRequirement !== '*'
          ? // if there is a version requirement, compatible version have to satisfy this requirement
            availableVersions.filter((v) => v && satisfies(v, versionRequirement.replace('ˆ', '^')))
          : // otherwise compatible versions must be below the reference, in the allowed major version range and satisfy the pre-release constraint
            availableVersions.filter(
              (v) =>
                v &&
                major(v) <= major(versionReference) &&
                compareVersions(v, Math.max(major(versionReference) - this.allowedMajorVersions, 0).toString()) !== -1 &&
                (!v.includes('-') || (!this.heuristics[currentRequirement.name]?.isDirectDependency && this.allowPreReleases)),
            );
      // also filter them by their allowed minor and patch range
      compatibleVersions = this.getVersionsInMinorAndPatchRange(compatibleVersions);

      // remove package set if needed
      if (!this.force) {
        this.packageSets = this.packageSets.filter((ps) =>
          ps.filter((entry) => entry[1]).some((entry) => !selectedPackageVersions.map((rp) => rp.name).includes(entry[0])),
        );
      }

      // collect metrics
      this.metrics.checkedDependencies++;
      if (currentRequirement.peer) {
        this.metrics.checkedPeers++;
      }

      let conflictState: ConflictState = { state: State.CONFLICT };
      let backtracking = false;

      // go through all compatible versions
      for (const versionToExplore of compatibleVersions) {
        if (conflictState.state === State.CONFLICT) {
          // skip over versions that violate pre-release constraint
          if (!this.heuristics[currentRequirement.name]?.isDirectDependency && !this.allowPreReleases && versionToExplore.includes('-')) {
            continue;
          }

          // collect metric
          this.metrics.checkedVersions++;

          // load package details and update peers heuristic
          const packageDetails = await this.client.getPackageDetails(currentRequirement.name, versionToExplore);
          if (packageDetails.peerDependencies) {
            this.heuristics[currentRequirement.name].peers = Object.keys(packageDetails.peerDependencies);
          }

          // update open requirements
          const { newOpenRequirements, newEdges } = await this.addDependenciesToOpenSet(
            packageDetails,
            closedRequirements,
            openRequirements,
            edges,
          );

          // go to next evaluation step with updated requirements and selected versions
          conflictState = await this.evaluationStep(
            currentRequirement.peer &&
              !selectedPackageVersions.some((rp) => rp.name === packageDetails.name && rp.semVerInfo === packageDetails.version)
              ? [...selectedPackageVersions, { name: packageDetails.name, semVerInfo: packageDetails.version }]
              : selectedPackageVersions,
            [...closedRequirements, currentRequirement],
            newOpenRequirements,
            newEdges,
          );

          // directly backtrack to a package from a set, if current requirement is not a peer dependency
          // otherwise try other versions too
          if (
            !this.force &&
            (this.packageSets.length || !currentRequirement.peer) &&
            !this.packageSets.find((ps) => ps.find((entry) => entry[0] === currentRequirement.name))
          ) {
            backtracking = true;
            break;
          }
        }
      }

      // if no version is eligible and no backtracking is needed, a new package set is created for peer dependencies
      if (conflictState.state === State.CONFLICT && !backtracking) {
        this.heuristics[currentRequirement.name].conflictPotential++;
        if (!this.force && currentRequirement.peer) {
          // retrieve old package set that includes parent of current requirement
          const parent = edges.find((edge) => edge[1] === currentRequirement.name)?.[0];
          const oldPackageSet = this.packageSets.find((ps) => ps.find((entry) => entry[0] === parent));
          let packageSet: PackageSet;

          if (!oldPackageSet) {
            // create new set if old package set doesn't exist
            packageSet = [];
            this.packageSets.push(packageSet);
          } else {
            packageSet = oldPackageSet;
          }

          // if package set has no entry matching the current requirement, add it
          if (!packageSet.find((entry) => entry[0] === currentRequirement.name && entry[1] === currentRequirement.peer)) {
            packageSet.push([currentRequirement.name, currentRequirement.peer]);
          }

          // adds parents of current requirement and their non-peer parents to package set
          edges.forEach((edge) => {
            // for every parent of current requirement that isn't already in package set
            if (edge[1] === currentRequirement.name && !packageSet.find((entry) => entry[0] === edge[0])) {
              // check if parent is peer itself
              const parentEdges = edges.filter((parentEdge) => parentEdge[1] === edge[0]);
              const hasPeerParent = parentEdges.some((parentEdge) => parentEdge[2]);
              // add parent (with peer status) to package set, if not already included
              if (!packageSet.find((entry) => entry[0] === edge[0] && entry[1] === hasPeerParent)) {
                packageSet.push([edge[0], hasPeerParent]);
              }
              // add parents of parent to package set, if they are no peer and not already included
              for (const parentEdge of parentEdges) {
                if (!packageSet.find((entry) => entry[0] === parentEdge[0] && !entry[1])) {
                  packageSet.push([parentEdge[0], false]);
                }
              }
            }
          });
        }
      }

      return conflictState;
    } else {
      // collect metrics
      this.metrics.resolvedPackages = closedRequirements.length;
      this.metrics.resolvedPeers = selectedPackageVersions.length;

      // if all open requirements are closed, return the selected package versions and leave recursion
      return { result: selectedPackageVersions, state: State.OK };
    }
  }

  /**
   * updates the open requirements with new dependencies of the current package
   * @param packageDetails details of the current package with peer dependencies and dependencies
   * @param closedRequirements the already closed requirements
   * @param openRequirements the current open requirements
   * @param edges all edges between packages, that have been seen
   * @private
   */
  private async addDependenciesToOpenSet(
    packageDetails: PackageDetails,
    closedRequirements: PackageRequirement[],
    openRequirements: PackageRequirement[],
    edges: EdgeWithPeer[],
  ): Promise<{ newOpenRequirements: PackageRequirement[]; newEdges: EdgeWithPeer[] }> {
    let newOpenRequirements = [...openRequirements];
    const newEdges: EdgeWithPeer[] = [...edges];

    // get possible new requirements from package details of the current package
    const newRequirements: PackageRequirement[] = [
      ...(packageDetails.peerDependencies
        ? Object.entries(packageDetails.peerDependencies).map(([name, versionRequirement]) => ({
            name,
            versionRequirement,
            peer: true,
          }))
        : []),
      ...(packageDetails.dependencies
        ? Object.entries(packageDetails.dependencies).map(([name, versionRequirement]) => ({
            name,
            versionRequirement,
            peer: false,
          }))
        : []),
    ];

    // add new requirement to open requirements if not already closed or included & create edge & heuristic if needed
    for (const newRequirement of newRequirements) {
      if (
        !newOpenRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement) &&
        !closedRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement)
      ) {
        newOpenRequirements.push(newRequirement);
        const existingEdge = newEdges.find((e) => e[0] === packageDetails.name && e[1] === newRequirement.name);
        if (existingEdge) {
          // change peer status of existing edge
          existingEdge[2] = newRequirement.peer;
        } else {
          // add edge between current package and its dependency
          newEdges.push([packageDetails.name, newRequirement.name, newRequirement.peer]);
        }
        await this.createHeuristics(newRequirement.name);
      }
    }

    // sort new dependencies by heuristics
    newOpenRequirements = this.sortByHeuristics(newOpenRequirements);

    return { newOpenRequirements, newEdges };
  }

  /**
   * creates new heuristic entry for a package if not already existing
   * @param name package name
   * @param pinnedVersion pinned version of package (optional)
   * @param isDirectDependency if the package is a direct dependency
   * @private
   */
  private async createHeuristics(name: string, pinnedVersion?: string, isDirectDependency = false) {
    if (!this.heuristics[name]) {
      // retrieve possible versions and mean size of all versions
      const { versions, meanSize } = await this.client.getAllVersionsFromRegistry(name);
      // sort versions descending
      versions.sort(compareVersions);
      versions.reverse();

      // use a version as reference that is in the expected range
      const versionReference = this.getVersionReference(versions, major);

      // get filtered versions that are below the reference, in the allowed major version range
      // and that satisfy the pinned versions and pre-release constraint
      let versionsForPeers = versions.filter(
        (v) =>
          v &&
          major(v) <= major(versionReference) &&
          compareVersions(v, Math.max(major(versionReference) - this.allowedMajorVersions, 0).toString()) !== -1 &&
          (!v.includes('-') || (!isDirectDependency && this.allowPreReleases)) &&
          (!pinnedVersion || satisfies(v, pinnedVersion)),
      );
      // also filter them by their allowed minor and patch range
      versionsForPeers = this.getVersionsInMinorAndPatchRange(versionsForPeers);

      // get peer dependencies of all these versions and add them to the peers of this heuristic
      const peers: string[] = [];
      for (const version of versionsForPeers) {
        const { peerDependencies } = await this.client.getPackageDetails(name, version);
        if (peerDependencies) {
          for (const peerDependency of Object.keys(peerDependencies)) {
            if (!peers.includes(peerDependency)) {
              peers.push(peerDependency);
            }
          }
        }
      }

      // create the actual heuristic entry with all values
      this.heuristics[name] = {
        conflictPotential: 0,
        isDirectDependency,
        meanSize,
        peers,
        pinnedVersion,
        versionRange: this.getRangeBetweenVersions(versions),
      };
    }
  }

  /**
   * find a reasonable reference version that is not more than 1 away from its predecessor
   * @param versions all versions that possible
   * @param func compare function for versions (major, minor or patch)
   * @private
   */
  private getVersionReference(
    versions: string[],
    func: (version: string | SemVer, optionsOrLoose?: boolean | semver.Options) => number,
  ): string {
    return versions.length === 1
      ? versions[0]
      : versions.find((version, idx, array) => func(version) - (array[idx + 1] ? func(array[idx + 1]) : 0) <= 1);
  }

  /**
   * get filtered versions that are in the allowed range of minor and patch versions
   * @param versions versions to filter
   * @private
   */
  private getVersionsInMinorAndPatchRange(versions: string[]): string[] {
    const result: string[] = [];
    const majorVersions = uniq(versions.map((v) => major(v)));
    // for each major version, only use allowed number of minor and patch versions
    for (const majorVersion of majorVersions) {
      const currentVersions = versions.filter((v) => major(v) === majorVersion);
      result.push(...currentVersions.slice(0, this.allowedMinorAndPatchVersions));
    }

    return result;
  }

  /**
   * sorts the package requirements in place by heuristics
   * @param packageRequirements the package requirements to sort
   * @private
   */
  private sortByHeuristics(packageRequirements: PackageRequirement[]): PackageRequirement[] {
    const nodes: string[] = [];
    const edges: Edge[] = [];
    const indirectEdges: Edge[] = [];
    // add peer dependencies to nodes and their important connections to edges
    for (const pr of packageRequirements) {
      if (pr.peer && !nodes.includes(pr.name)) {
        nodes.push(pr.name);
      }
      const heuristics = this.heuristics[pr.name];
      if (heuristics.peers?.length) {
        for (const peer of heuristics.peers) {
          if (!nodes.includes(pr.name)) {
            nodes.push(pr.name);
          }
          if (!nodes.includes(peer)) {
            nodes.push(peer);
          }
          // only add edges that won't cause cycles
          if (!indirectEdges.find((e) => e[0] === peer && e[1] === pr.name)) {
            edges.push([pr.name, peer]);
            indirectEdges.push([pr.name, peer]);
          }
          // track edges from indirect parents
          edges.forEach((e) => {
            if (e[1] === pr.name) {
              indirectEdges.push([e[0], peer]);
            }
          });
        }
      }
    }

    // perform topological search with defined nodes and edges
    const order = toposort.array(nodes, edges);

    // split the requirements in those with peers (always first) and those without peers (always second)
    const upper = packageRequirements.filter((pr) => nodes.includes(pr.name));
    const lower = packageRequirements.filter((pr) => !nodes.includes(pr.name));

    // sorting of package requirements with peers by topological order
    upper.sort((pr1: PackageRequirement, pr2: PackageRequirement) => {
      if (order.indexOf(pr1.name) > order.indexOf(pr2.name)) {
        return 1;
      } else {
        return -1;
      }
    });

    // sorting of package requirements without peers
    lower.sort((pr1: PackageRequirement, pr2: PackageRequirement) => {
      const heuristics1 = this.heuristics[pr1.name];
      const heuristics2 = this.heuristics[pr2.name];

      // direct dependencies
      if (heuristics1.isDirectDependency && !heuristics2.isDirectDependency) {
        return 1;
      } else if (!heuristics1.isDirectDependency && heuristics2.isDirectDependency) {
        return -1;
      }

      // conflict potential
      if (heuristics1.conflictPotential > heuristics2.conflictPotential) {
        return 1;
      } else if (heuristics1.conflictPotential < heuristics2.conflictPotential) {
        return -1;
      }

      // version range & size
      const versionRange1 = heuristics1.versionRange;
      const versionRange2 = heuristics2.versionRange;
      if (versionRange1.type === versionRange2.type) {
        if (versionRange1.value !== versionRange2.value) {
          return versionRange1.value - versionRange2.value;
        } else {
          return heuristics1.meanSize - heuristics2.meanSize;
        }
      } else if (heuristics1.versionRange.type.endsWith('major') || heuristics2.versionRange.type.endsWith('patch')) {
        return 1;
      } else {
        return -1;
      }
    });

    return [...upper, ...lower];
  }

  /**
   * get range between versions with type (major, minor, patch) and value (versions of type between them)
   * @param versions versions to get maximum range of
   * @private
   */
  private getRangeBetweenVersions(versions: string[]): VersionRange {
    // get highest and lowest versions that are reasonable
    const v1 = this.getVersionReference(versions, major);
    const v2 = versions[versions.length - 1];
    let type = diff(v1, v2);
    let value: number;
    switch (type) {
      case 'major':
      case 'premajor':
        value = major(v1) - major(v2);
        type = 'major';
        break;
      case 'minor':
      case 'preminor':
        value = minor(v1) - minor(v2);
        type = 'minor';
        break;
      default:
        value = patch(v1) - patch(v2);
        type = 'patch';
        break;
    }

    return { type, value: Math.abs(value) };
  }

  /**
   * get pinned versions declared in command line parameter or package.json
   * @param params command line parameters including packages to install
   * @param dependencies dependencies specified in package.json
   * @private
   */
  private async getPinnedVersions(params: (string | number)[], dependencies: Record<string, string>): Promise<Record<string, string>> {
    const pinnedVersions = {};
    // in case of install command, retrieve package names and versions from parameters
    const command = params.shift();
    if (command === 'i' || command === 'install') {
      if (params.length) {
        // get versions from params
        for (const param of params) {
          if (typeof param === 'number') {
            continue;
          }
          // either take version from parameter or from registry client and add it to pinned versions
          const paramSplit = param.split(/(?<!^)@/);
          const name = paramSplit.shift();
          if (!paramSplit.length) {
            const versions = (await this.client.getAllVersionsFromRegistry(name)).versions.sort(compareVersions).reverse();
            pinnedVersions[name] = versions[0];
          } else {
            pinnedVersions[name] = paramSplit.shift();
          }
        }
        return pinnedVersions;
      }
    }
    // if pinVersions option is set, add versions from package.json to pinned versions
    if (this.pinVersions) {
      Object.entries(dependencies)
        .filter(([name]) => !pinnedVersions[name])
        .forEach(([name, version]) => (pinnedVersions[name] = version));
    }

    return pinnedVersions;
  }
}
