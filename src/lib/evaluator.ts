import { compareVersions, satisfies } from 'compare-versions';
import { PackageJson } from 'nx/src/utils/package-json';
import * as fs from 'fs';
import * as process from 'process';
import {getAbbreviatedPackument, getPackageManifest, getPackument} from 'query-registry';
import { ArgumentsCamelCase } from 'yargs';
import { Peers, Result, Versions } from './evaluator.interface';

const MAX_LEVEL = 100;

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
      const rootPeers: Record<string, string> = {
        ...file.dependencies,
        ...file.peerDependencies,
      };
      // TODO: sort root peers by impact/size (most important in last position)
      const rootKeys = Object.keys(rootPeers).reverse();
      await this.buildPeerDependencyTree(rootKeys);
      console.debug(this.results.sort((a, b) => a.level - b.level));
    } catch (e) {
      console.error(e);
      console.error('Missing package.json file at current path');
      return;
    }
  }

  private async buildPeerDependencyTree(names: string[]) {
    let level = 0;

    // TODO: backtracking
    for (const name of names) {
      let redo = false;
      let version: string;
      await this.setVersions(name);
      do {
        version = this.versions[name].pop();
        const manifest = await getPackageManifest({name, version});
        if (manifest.peerDependencies) {
          redo = !(await this.addToNextPeers(manifest.peerDependencies));
        }
      } while (redo);
      this.results.push({name, version, level: level++});
    }
    while (Object.keys(this.nextPeers).length || level > MAX_LEVEL) {
      await this.addPeersToResult(Object.assign({}, this.nextPeers), level);
      level++;
    }
  }

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

  private async getIntersection(name: string, range1: string, range2: string): Promise<string> {
    const versions = Object.keys((await getPackument({ name })).versions);
    return versions.filter((v) => satisfies(v, range1) && satisfies(v, range2)).join(' || ');
  }

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

// TODO: maybe need to replace ˆ with ^ in ranges
