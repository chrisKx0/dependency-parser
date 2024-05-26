import { compareVersions, satisfies } from 'compare-versions';
import { PackageJson } from 'nx/src/utils/package-json';
import * as fs from 'fs';
import * as process from 'process';
import { getAbbreviatedPackument, getPackageManifest, getPackument, PackageManifest } from 'query-registry';
import { ArgumentsCamelCase } from 'yargs';
import { PackageRequirement, Peers, ResolvedPackage, Result, Versions } from './evaluator.interface';
// import { union } from 'lodash';

const MAX_LEVEL = 100;

interface ConflictState {
  result?: ResolvedPackage[] | PackageRequirement[];
  state: State;
}

enum State {
  OK = 'OK',
  CONFLICT = 'CONFLICT',
}

export class Evaluator {
  private nextPeers: Peers = {};
  private readonly results: Result[] = [];
  private readonly versions: Versions = {};

  public async evaluate(args: ArgumentsCamelCase) {
    let path = (args.path as string) ?? process.cwd();

    if (!/[/\\]package\.json$/.test(path)) {
      path += '\\package.json';
    }

    try {
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
      // TODO: add direct dependencies to heuristic
      const result = await this.evaluationStep([], [], openRequirements);
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
    // knownConflicts: ConflictState[],
  ): Promise<ConflictState> {
    if (openRequirements.length) {
      const currentRequirement = openRequirements.shift();
      const version = selectedPackageVersions.find((rp) => rp.name === currentRequirement.name)?.semVerInfo;
      try {
        const availableVersions = version
            ? [version]
            : Object.keys((await getPackument({ name: currentRequirement.name })).versions)
                .sort(compareVersions)
                .reverse();

        // TODO: add version range -> heuristic

        const compatibleVersions = currentRequirement.versionRequirement
          ? availableVersions.filter((v) => satisfies(v, currentRequirement.versionRequirement.replace('ˆ', '^')))
          : availableVersions;

        // TODO: check pinned versions heuristic

        let conflictState: ConflictState = { result: openRequirements, state: State.CONFLICT };

        // TODO: add to heuristics ?
        // const currentRequirementSet = union(openRequirements, closedRequirements);
        // const isSuperset = knownConflicts.some((cs) => cs.result.every((rp) => currentRequirementSet.find((pr) => rp.name === pr.name)));
        // console.log(isSuperset);
        // if (isSuperset) {
        //   return { state: State.CONFLICT };
        // }
        for (const versionToExplore of compatibleVersions) {
          if (conflictState.state === State.CONFLICT) {
            const packageDetails = await getPackageManifest({ name: currentRequirement.name, version: versionToExplore });
            console.debug(`${currentRequirement.name} --- ${versionToExplore}`);
            conflictState = await this.evaluationStep(
                currentRequirement.peer ? [...selectedPackageVersions,  { name: packageDetails.name, semVerInfo: packageDetails.version }] : selectedPackageVersions,
              [...closedRequirements, currentRequirement],
              this.addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements),
              // this.addConflictToKnownConflicts(conflictState, knownConflicts),
            );
          }
        }
        // TODO: maybe bump conflict potential -> heuristic
        return conflictState;
      } catch (e) {
        return { result: openRequirements, state: State.CONFLICT };
      }
    } else {
      return {result: selectedPackageVersions, state: State.OK};
    }
  }

  private addConflictToKnownConflicts(conflictState: ConflictState, knownConflicts: ConflictState[]) {
    knownConflicts.push(conflictState);
    return knownConflicts;
  }

  private addDependenciesToOpenSet(
    packageDetails: PackageManifest,
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
      }
    }
    return newOpenRequirements;
  }

  /**
   * @deprecated
   * @param names
   * @private
   */
  private async buildPeerDependencyTree(names: string[]) {
    let level = 0;

    // TODO: backtracking
    for (const name of names) {
      let redo = false;
      let version: string;
      await this.setVersions(name);
      do {
        version = this.versions[name].pop();
        const manifest = await getPackageManifest({ name, version });
        if (manifest.peerDependencies) {
          redo = !(await this.addToNextPeers(manifest.peerDependencies));
        }
      } while (redo);
      this.results.push({ name, version, level: level });
    }
    while (Object.keys(this.nextPeers).length || level > MAX_LEVEL) {
      level++;
      await this.addPeersToResult(Object.assign({}, this.nextPeers), level);
    }
  }

  /**
   * @deprecated
   * @param peers
   * @param level
   * @private
   */
  private async addPeersToResult(peers: Peers, level: number) {
    this.nextPeers = {};
    if (!peers || !Object.keys(peers).length) {
      return;
    }
    for (const [name, peerVersion] of Object.entries(peers)) {
      const resultEntry = this.results.find((r) => r.name === name);
      if (resultEntry?.version && satisfies(resultEntry.version, peerVersion)) {
        continue;
      } else {
        // TODO: backtracking
      }
      await this.setVersions(name, peerVersion);
      if (this.versions[name].length) {
        const version = this.versions[name].pop();
        this.results.push({ name, version, level });
        const manifest = await getPackageManifest({ name, version });
        if (manifest.peerDependencies) {
          await this.addToNextPeers(manifest.peerDependencies);
        }
      } else {
        // TODO: backtracking
      }
    }
  }

  /**
   * @deprecated
   * @param peers
   * @private
   */
  private async addToNextPeers(peers: Peers): Promise<boolean> {
    const nextPeers: Peers = {};
    for (const [name, version] of Object.entries(peers)) {
      if (this.nextPeers[name]) {
        const intersection = await this.getIntersection(name, this.nextPeers[name], version);
        if (!intersection) {
          return false;
        }
        nextPeers[name] = intersection;
      } else {
        nextPeers[name] = version;
      }
    }
    Object.entries(nextPeers).forEach(([name, version]) => (this.nextPeers[name] = version));
    return true;
  }

  /**
   * @deprecated
   * @param name
   * @param range1
   * @param range2
   * @private
   */
  private async getIntersection(name: string, range1: string, range2: string): Promise<string> {
    const versions = Object.keys((await getPackument({ name })).versions);
    return versions.filter((v) => satisfies(v, range1) && satisfies(v, range2)).join(' || ');
  }

  /**
   * @deprecated
   * @param name
   * @param range
   * @private
   */
  private async setVersions(name: string, range?: string) {
    if (this.versions[name]) {
      return;
    }
    const packument = await getAbbreviatedPackument({ name });
    const versions = Object.keys(packument.versions).sort(compareVersions);
    // TODO: filter also by special versions (like 18.0.0-next.6) according to user input
    this.versions[name] = range ? versions.filter((v) => satisfies(v, range)) : versions;
  }
}
