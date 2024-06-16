import { compareVersions, satisfies } from 'compare-versions';
import { PackageJson } from 'nx/src/utils/package-json';
import * as fs from 'fs';
import * as process from 'process';
import { ArgumentsCamelCase } from 'yargs';
import { ConflictState, Heuristics, PackageDetails, PackageRequirement, ResolvedPackage, State, VersionRange } from './evaluator.interface';
import { RegistryClient } from './registry-client';
import { diff, major, minor, patch, validRange } from 'semver';

// TODO: Possible Error: Invalid argument not valid semver ('*' received)
// TODO: include pinned versions of all direct dependencies to result
// TODO: improve heuristics -> current order with all the newly added versions is super slow

const PACKAGE_BUNDLES = ['@angular', '@nx'];

export class Evaluator {
  private readonly client = new RegistryClient();
  private readonly heuristics: Record<string, Heuristics> = {};
  private directDependencies: string[] = [];

  public async evaluate(args: ArgumentsCamelCase): Promise<ConflictState> {
    // get package.json path from args or current working directory & add filename if necessary
    const path = ((args.path as string) ?? process.cwd()) + '/package.json';

    // read package.json to retrieve dependencies and peer dependencies
    const packageJson: PackageJson = JSON.parse(fs.readFileSync(path, { encoding: 'utf8' }));
    const openRequirements: PackageRequirement[] = [
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
    this.directDependencies = openRequirements.map((pr) => pr.name);

    // load cache from disk
    this.client.readDataFromFiles();

    // add heuristics for direct dependencies & pinned versions
    const pinnedVersions: Record<string, string> = await this.getPinnedVersions(args._, {
      ...packageJson.dependencies,
      ...packageJson.peerDependencies,
    });
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
      // edit bundled packages to also be of the same version
      openRequirements
        .filter((pr) => PACKAGE_BUNDLES.some((pb) => pr.name.startsWith(pb) && name.startsWith(pb)))
        .forEach((pr) => (pr.versionRequirement = pinnedVersion));
    }

    // sort direct dependencies by heuristics
    openRequirements.sort(this.sortByHeuristics);

    // evaluation
    const result = await this.evaluationStep([], [], openRequirements);

    // save cache to disk
    this.client.writeDataToFiles();
    return result;
  }

  private async evaluationStep(
    selectedPackageVersions: ResolvedPackage[],
    closedRequirements: PackageRequirement[],
    openRequirements: PackageRequirement[],
  ): Promise<ConflictState> {
    if (openRequirements.length) {
      const currentRequirement = openRequirements.shift();
      let version = selectedPackageVersions.find((rp) => rp.name === currentRequirement.name)?.semVerInfo;
      if (!version) {
        // bundled packages need to be of the same version
        version = selectedPackageVersions.find((rp) =>
          PACKAGE_BUNDLES.some((pb) => rp.name.startsWith(pb) && currentRequirement.name.startsWith(pb)),
        )?.semVerInfo;
      }
      let availableVersions: string[];
      try {
        if (version) {
          availableVersions = [version];
        } else {
          const allVersions = (await this.client.getAllVersionsFromRegistry(currentRequirement.name)).versions
            .sort(compareVersions)
            .reverse();
          const allowedMajorVersions = 2; // TODO: edit default via optional user input
          const pinnedVersion = this.heuristics[currentRequirement.name].pinnedVersion;

          availableVersions = allVersions.length
            ? allVersions.filter((v) => compareVersions(v, Math.max(major(allVersions[0]) - allowedMajorVersions, 0).toString()) !== -1)
            : allVersions;
          if (validRange(pinnedVersion)) {
            availableVersions = availableVersions.filter((v) => satisfies(v, pinnedVersion));
          }
        }

        const compatibleVersions = currentRequirement.versionRequirement
          ? availableVersions.filter((v) => satisfies(v, currentRequirement.versionRequirement.replace('ˆ', '^')))
          : availableVersions;

        let conflictState: ConflictState = { state: State.CONFLICT };

        for (const versionToExplore of compatibleVersions) {
          if (conflictState.state === State.CONFLICT) {
            const packageDetails = await this.client.getPackageDetails(currentRequirement.name, versionToExplore);
            if (packageDetails.peerDependencies) {
              this.heuristics[currentRequirement.name].peers = Object.keys(packageDetails.peerDependencies).filter((peer) =>
                this.directDependencies.includes(peer),
              );
            }
            conflictState = await this.evaluationStep(
              currentRequirement.peer &&
                !selectedPackageVersions.some((rp) => rp.name === packageDetails.name && rp.semVerInfo === packageDetails.version)
                ? [...selectedPackageVersions, { name: packageDetails.name, semVerInfo: packageDetails.version }]
                : selectedPackageVersions,
              [...closedRequirements, currentRequirement],
              await this.addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements),
            );
          }
        }
        if (conflictState.state === State.CONFLICT) {
          this.heuristics[currentRequirement.name].conflictPotential++;
        }
        return conflictState;
      } catch (e) {
        console.error(e);
        return { state: State.CONFLICT };
      }
    } else {
      return { result: selectedPackageVersions, state: State.OK };
    }
  }

  private async addDependenciesToOpenSet(
    packageDetails: PackageDetails,
    closedRequirements: PackageRequirement[],
    openRequirements: PackageRequirement[],
  ): Promise<PackageRequirement[]> {
    const newOpenRequirements = [...openRequirements];
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

    // add requirements to open requirements if needed & create heuristics if none exist
    for (const newRequirement of newRequirements) {
      if (
        !newOpenRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement) &&
        !closedRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement)
      ) {
        newOpenRequirements.push(newRequirement);
        await this.createHeuristics(newRequirement.name, newRequirement.versionRequirement);
      }
    }

    // sort new dependencies by heuristics
    newOpenRequirements.sort(this.sortByHeuristics);

    return newOpenRequirements;
  }

  private async createHeuristics(name: string, pinnedVersion?: string, isDirectDependency = false) {
    if (!this.heuristics[name]) {
      const { versions, meanSize } = await this.client.getAllVersionsFromRegistry(name);
      versions.sort(compareVersions).reverse();
      this.heuristics[name] = {
        conflictPotential: 0,
        isDirectDependency,
        meanSize,
        pinnedVersion,
        versionRange: this.getRangeBetweenVersions(versions[0], versions[versions.length - 1]),
      };
    }
  }

  private sortByHeuristics = (pr1: PackageRequirement, pr2: PackageRequirement): number => {
    const heuristics1 = this.heuristics[pr1.name]; // negative value prioritizes pr1
    const heuristics2 = this.heuristics[pr2.name]; // positive value prioritizes pr2

    // direct dependencies
    if (heuristics1.isDirectDependency || heuristics2.isDirectDependency) {
      if (!heuristics2.isDirectDependency) {
        return 1;
      } else if (!heuristics1.isDirectDependency) {
        return -1;
      }
      const hasPeer1 = heuristics1.peers?.includes(pr2.name);
      const hasPeer2 = heuristics2.peers?.includes(pr1.name);
      if (!hasPeer1 && hasPeer2) {
        return 1;
      } else if (hasPeer1 && !hasPeer2) {
        return -1;
      }
    }

    // conflict potential
    if (heuristics1.conflictPotential > heuristics2.conflictPotential) {
      return 1;
    } else if (heuristics1.conflictPotential < heuristics2.conflictPotential) {
      return -1;
    }

    // version range
    if (heuristics1.versionRange.type === heuristics2.versionRange.type) {
      if (heuristics1.versionRange.value === heuristics1.versionRange.value) {
        // size
        return heuristics1.meanSize - heuristics2.meanSize;
      }
      return heuristics1.versionRange.value - heuristics2.versionRange.value;
    } else {
      if (heuristics1.versionRange.type.endsWith('major') || heuristics2.versionRange.type.endsWith('patch')) {
        return 1;
      }
      return -1;
    }
  };

  private getRangeBetweenVersions(v1: string, v2: string): VersionRange {
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

  private async getPinnedVersions(params: (string | number)[], dependencies: Record<string, string>): Promise<Record<string, string>> {
    const pinnedVersions = {};
    const command = params.shift();
    if (command !== 'i' && command !== 'install') {
      return {};
    }

    if (params.length) {
      // get versions from params
      for (const param of params) {
        if (typeof param === 'number') {
          continue;
        }
        const paramSplit = param.split(/(?<!^)@/);
        const name = paramSplit.shift();
        if (!paramSplit.length) {
          const versions = (await this.client.getAllVersionsFromRegistry(name)).versions.sort(compareVersions).reverse();
          pinnedVersions[name] = versions[0];
        } else {
          pinnedVersions[name] = paramSplit.shift();
        }
      }
    } else {
      // get versions from dependencies
      Object.entries(dependencies).forEach(([name, version]) => (pinnedVersions[name] = version));
    }

    return pinnedVersions;
  }
}
