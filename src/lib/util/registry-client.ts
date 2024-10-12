import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { sum } from 'lodash';
import { getPackageManifest, getPackument } from 'query-registry';

import { PackageDetails, Versions } from './interfaces';

const DETAILS_FILENAME = 'details.json';

export class RegistryClient {
  private details: Record<string, PackageDetails> = {};
  private versions: Record<string, Versions> = {};
  constructor(private readonly path = __dirname + '/../../../data') {}

  /**
   * retrieves package details from npm registry for a specific package version (with cache)
   * @param name name of the package
   * @param version version of the package
   */
  public async getPackageDetails(name: string, version: string): Promise<PackageDetails> {
    const key = `${name}@${version}`;
    let details = this.details[key];
    if (!details) {
      const manifest = await getPackageManifest({ name, version });
      details = {
        name: manifest.name,
        version: manifest.version,
        dependencies: manifest.dependencies,
        peerDependencies: manifest.peerDependencies,
      };
      this.details[key] = details;
    }
    return details;
  }

  /**
   * retrieves all versions and sizes of a package from npm registry (with cache)
   * @param name name of the package
   */
  public async getAllVersionsFromRegistry(name: string): Promise<Versions> {
    let versions: Versions = this.versions[name];
    if (!versions) {
      versions = { versions: [], meanSize: 0 };
      const packument = await getPackument({ name });
      // extract versions from packument
      versions.versions = packument?.versions ? Object.keys(packument.versions) : [];
      if (packument.versions) {
        versions.versions = Object.keys(packument.versions).filter((version) => version);
        // extract sizes of each package version and calculate their mean size
        const sizes = Object.values(packument.versions)
          .map((rpm) => rpm?.dist?.unpackedSize)
          .filter((n) => !isNaN(n));
        versions.meanSize = sizes.length ? sum(sizes) / sizes.length : 0;
      }
      this.versions[name] = versions;
    }
    return versions;
  }

  /**
   * loads a saved cache from file system
   */
  public readDataFromFiles() {
    try {
      const details = readFileSync(`${this.path}/${DETAILS_FILENAME}`, { encoding: 'utf8' });
      this.details = JSON.parse(details);
    } catch (e) {
      // best practice if file doesn't exist
    }
  }

  /**
   * saves the cache to file system
   */
  public writeDataToFiles() {
    if (!existsSync(this.path)) {
      mkdirSync(this.path);
    }
    writeFileSync(`${this.path}/${DETAILS_FILENAME}`, JSON.stringify(this.details), { encoding: 'utf8' });
  }
}
