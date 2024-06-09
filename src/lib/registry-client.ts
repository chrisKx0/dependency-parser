import * as fs from 'fs';
import { getPackageManifest, getPackument } from 'query-registry';
import { PackageDetails, Versions } from './evaluator.interface';
import { sum } from 'lodash';

// TODO: error handling

const DETAILS_FILENAME = 'details.json';
const VERSIONS_FILENAME = 'versions.json';

export class RegistryClient {
  constructor(
    private details: Record<string, PackageDetails> = {},
    private versions: Record<string, Versions> = {},
    private readonly path = __dirname + '/../../data', // TODO: remove data from assets and /../.. from this path
  ) {}

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

  public async getAllVersionsFromRegistry(name: string): Promise<Versions> {
    let versions: Versions = this.versions[name];
    if (!versions) {
      versions = { versions: [], meanSize: 0 };
      const packument = await getPackument({ name });
      versions.versions = packument?.versions ? Object.keys(packument.versions) : [];
      if (packument.versions) {
        versions.versions = Object.keys(packument.versions).filter((version) => version);
        const sizes = Object.values(packument.versions)
                .map((rpm) => rpm?.dist?.unpackedSize)
                .filter((n) => !isNaN(n));
        versions.meanSize = this.calculateMeanSize(sizes);
      }
      this.versions[name] = versions;
    }
    return versions;
  }

  public readDataFromFiles() {
    // TODO: force regeneration after time
    if (fs.existsSync(`${this.path}/${DETAILS_FILENAME}`)) {
      const details = fs.readFileSync(`${this.path}/${DETAILS_FILENAME}`).toString();
      this.details = JSON.parse(details);
    }
    if (fs.existsSync(`${this.path}/${VERSIONS_FILENAME}`)) {
      const versions = fs.readFileSync(`${this.path}/${VERSIONS_FILENAME}`).toString();
      this.versions = JSON.parse(versions);
    }
  }

  public writeDataToFiles() {
    if (!fs.existsSync(this.path)) {
      fs.mkdirSync(this.path);
    }
    fs.writeFileSync(`${this.path}/${DETAILS_FILENAME}`, JSON.stringify(this.details));
    fs.writeFileSync(`${this.path}/${VERSIONS_FILENAME}`, JSON.stringify(this.versions));
  }

  private calculateMeanSize(sizes: number[]): number {
    if (!sizes.length) {
      return 0;
    }
    return sum(sizes) / sizes.length;
  }
}
