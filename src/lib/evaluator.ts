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

      // add direct dependency & pinned versions heuristics
      const pinnedVersions: Record<string, string> = {}; // TODO: get from user input + add type
      openRequirements.forEach(
        (pr) => (this.heuristics[pr.name] = { isDirectDependency: true, conflictPotential: 0, pinnedVersion: pinnedVersions[pr.name] }),
      );
      Object.entries(pinnedVersions).forEach(([name, pinnedVersion]) => {
        if (!this.heuristics[name]) {
          this.heuristics[name] = { conflictPotential: 0, pinnedVersion };
        }
      });

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
          if (!this.heuristics[currentRequirement.name].versionRange) {
            this.heuristics[currentRequirement.name].versionRange = { type: 'minor', value: 0 };
          }
        } else {
          const allVersions = (await this.client.getAllVersionsFromRegistry(currentRequirement.name)).sort(compareVersions).reverse();
          let allowedMajorVersions: number; // TODO: evaluate useful default & not only major versions (maybe) & get from user input
          const pinnedVersion = this.heuristics[currentRequirement.name].pinnedVersion;

          availableVersions =
            allVersions.length && allowedMajorVersions
              ? allVersions.filter((v) => compareVersions(v, (major(allVersions[0]) - allowedMajorVersions).toString()) !== -1)
              : allVersions;
          if (validRange(pinnedVersion)) {
            availableVersions = availableVersions.filter((v) => satisfies(v, pinnedVersion));
          }

          if (!this.heuristics[currentRequirement.name].versionRange) {
            this.heuristics[currentRequirement.name].versionRange = this.getRangeBetweenVersions(
              allVersions[0],
              allVersions[allVersions.length - 1],
            );
          }
        }

        const compatibleVersions = currentRequirement.versionRequirement
          ? availableVersions.filter((v) => satisfies(v, currentRequirement.versionRequirement.replace('ˆ', '^')))
          : availableVersions;

        let conflictState: ConflictState = { state: State.CONFLICT };

        for (const versionToExplore of compatibleVersions) {
          if (conflictState.state === State.CONFLICT) {
            const packageDetails = await this.client.getPackageDetails(currentRequirement.name, versionToExplore);
            // console.debug(`${currentRequirement.name} - ${versionToExplore}`);
            conflictState = await this.evaluationStep(
              currentRequirement.peer &&
                !selectedPackageVersions.some((rp) => rp.name === packageDetails.name && rp.semVerInfo === packageDetails.version)
                ? [...selectedPackageVersions, { name: packageDetails.name, semVerInfo: packageDetails.version }]
                : selectedPackageVersions,
              [...closedRequirements, currentRequirement],
              this.addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements),
            );
          }
        }
        if (conflictState.state === State.CONFLICT) {
          this.heuristics[currentRequirement.name].conflictPotential++;
        }
        return conflictState;
      } catch (e) {
        return { state: State.CONFLICT };
      }
    } else {
      return { result: selectedPackageVersions, state: State.OK };
    }
  }

  private addDependenciesToOpenSet(
    packageDetails: PackageDetails,
    closedRequirements: PackageRequirement[],
    openRequirements: PackageRequirement[],
  ): PackageRequirement[] {
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
    // TODO check heuristics: direct dependencies, conflict potential, version range (if already seen)
    for (const newRequirement of newRequirements) {
      if (
        !newOpenRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement) &&
        !closedRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement)
      ) {
        newOpenRequirements.push(newRequirement);
        if (!this.heuristics[newRequirement.name]) {
          this.heuristics[newRequirement.name] = { conflictPotential: 0 };
        }
      }
    }
    return newOpenRequirements;
  }

  private getRangeBetweenVersions(v1: string, v2: string): VersionRange {
    let type = diff(v1, v2);
    let value: number;
    switch (type) {
      case 'major':
        value = major(v1) - major(v2);
        break;
      case 'minor':
        value = minor(v1) - minor(v2);
        break;
      case 'patch':
        value = patch(v1) - patch(v2);
        break;
      default:
        value = 0;
        type = 'patch';
        break;
    }
    return { type, value: Math.abs(value) };
  }
}
