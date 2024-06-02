import * as fs from 'fs';
import { getPackageManifest, getPackument } from 'query-registry';
import { PackageDetails } from './evaluator.interface';

// TODO: error handling

export class RegistryClient {
  constructor(
    private details: Record<string, PackageDetails> = {},
    private versions: Record<string, string[]> = {},
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

  public async getAllVersionsFromRegistry(name: string): Promise<string[]> {
    let versions = this.versions[name];
    if (!versions) {
      const packument = await getPackument({ name });
      versions = packument?.versions ? Object.keys(packument.versions) : [];
      this.versions[name] = versions;
    }
    return versions;
  }

  public readDataFromFiles() {
    // TODO: force regeneration after time
    if (fs.existsSync(this.path + '/details')) {
      const details = fs.readFileSync(this.path + '/details').toString();
      this.details = JSON.parse(details);
    }
    if (fs.existsSync(this.path + '/versions')) {
      const versions = fs.readFileSync(this.path + '/versions').toString();
      this.versions = JSON.parse(versions);
    }
  }

  public writeDataToFiles() {
    if (!fs.existsSync(this.path)) {
      fs.mkdirSync(this.path);
    }
    fs.writeFileSync(this.path + '/details', JSON.stringify(this.details));
    fs.writeFileSync(this.path + '/versions', JSON.stringify(this.versions));
  }
}
