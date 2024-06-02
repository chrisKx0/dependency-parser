import { compareVersions, satisfies } from 'compare-versions';
import { PackageJson } from 'nx/src/utils/package-json';
import * as fs from 'fs';
import * as process from 'process';
import { ArgumentsCamelCase } from 'yargs';
import { ConflictState, Heuristics, PackageDetails, PackageRequirement, ResolvedPackage, State, VersionRange } from './evaluator.interface';
import { RegistryClient } from './registry-client';
import { diff, major, minor, patch, validRange } from 'semver';

export class Evaluator {
  constructor(private readonly client = new RegistryClient(), private readonly heuristics: Record<string, Heuristics> = {}) {}

  public async evaluate(args: ArgumentsCamelCase) {
    // get package.json path from args or current working directory & add filename if necessary
    let path = (args.path as string) ?? process.cwd();
    if (!/[/\\]package\.json$/.test(path)) {
      path += '/package.json';
    }

    try {
      // read package.json to retrieve dependencies and peer dependencies
      const file: PackageJson = JSON.parse(fs.readFileSync(path).toString());
      const openRequirements: PackageRequirement[] = [
        ...(file.peerDependencies
          ? Object.keys(file.peerDependencies).map((name) => ({
              name,
              peer: true,
            }))
          : []),
        ...(file.dependencies
          ? Object.keys(file.dependencies).map((name) => ({
              name,
              peer: false,
            }))
          : []),
      ];

      // load cache from disk
      this.client.readDataFromFiles();

      // add heuristics for direct dependencies & pinned versions
      // TODO: ignored versions ?
      const pinnedVersions: Record<string, string> = {}; // TODO: get from user input + add type
      for (const { name } of openRequirements) {
        await this.createHeuristics(name, pinnedVersions[name], true);
      }
      for (const [name, pinnedVersion] of Object.entries(pinnedVersions)) {
        await this.createHeuristics(name, pinnedVersion);
      }

      // sort direct dependencies by heuristics
      openRequirements.sort(this.sortByHeuristics);

      // evaluation
      const result = await this.evaluationStep([], [], openRequirements);

      // save cache to disk
      this.client.writeDataToFiles();
      console.log(result);
    } catch (e) {
      console.error(e);
      console.error('Missing package.json file at current path');
      return;
    }
  }

  private async evaluationStep(
    selectedPackageVersions: ResolvedPackage[],
    closedRequirements: PackageRequirement[],
    openRequirements: PackageRequirement[],
  ): Promise<ConflictState> {
    if (openRequirements.length) {
      const currentRequirement = openRequirements.shift();
      const version = selectedPackageVersions.find((rp) => rp.name === currentRequirement.name)?.semVerInfo;
      let availableVersions: string[];
      try {
        if (version) {
          availableVersions = [version];
        } else {
          const allVersions = (await this.client.getAllVersionsFromRegistry(currentRequirement.name)).sort(compareVersions).reverse();
          let allowedMajorVersions: number; // TODO: evaluate useful default & not only major versions (maybe) & get from user input
          const pinnedVersion = this.heuristics[currentRequirement.name].pinnedVersion;

          availableVersions =
            allVersions.length && allowedMajorVersions
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
      const allVersions = (await this.client.getAllVersionsFromRegistry(name)).sort(compareVersions).reverse();
      this.heuristics[name] = {
        conflictPotential: 0,
        isDirectDependency,
        pinnedVersion,
        versionRange: this.getRangeBetweenVersions(allVersions[0], allVersions[allVersions.length - 1]),
      };
    }
  }

  private sortByHeuristics = (pr1: PackageRequirement, pr2: PackageRequirement): number => {
    const heuristics1 = this.heuristics[pr1.name]; // negative value prioritizes pr1
    const heuristics2 = this.heuristics[pr2.name]; // positive value prioritizes pr2

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

    // version range
    if (heuristics1.versionRange.type === heuristics2.versionRange.type) {
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
}
