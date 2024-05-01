import { getPackageManifest, getPackument } from 'query-registry';

export interface PeerDependencies {
  version: string;
  peerDependencies: Record<string, string>;
}

export class RegistryClient {
  public async getPeerDependencies(name: string, version: string): Promise<PeerDependencies> {
    const manifest = await getPackageManifest({ name, version });
    return { version: manifest.version, peerDependencies: manifest.peerDependencies };
  }

  /**
   * @deprecated
   * @param name
   */
  public async getReadme(name: string): Promise<string> {
    const packument = await getPackument({ name });
    return packument?.readme;
  }
}
