import { readFileSync, writeFileSync } from 'fs';
import { PackageManager } from 'nx/src/utils/package-manager';
import { NxJsonConfiguration } from 'nx/src/config/nx-json';
import { lockFileExists } from 'nx/src/plugins/js/lock-file/lock-file';

import { ResolvedPackage } from './evaluator.interface';
import { PackageJson } from 'nx/src/utils/package-json';
import { execSync } from 'child_process';

// TODO: find out which PM and MT are installed to limit installation

export class Installer {
  public install(resolvedPackages: ResolvedPackage[], path?: string, packageManager?: PackageManager[]) {
    path = path ?? process.cwd();
    const packageJsonPath = path + '/package.json';
    const nxPath = path + '/nx.json';
    this.updatePackageJson(resolvedPackages, packageJsonPath);
    if (!packageManager?.length) {
      packageManager = this.getPackageManager(packageJsonPath, nxPath);
    }

    // TODO: user decision if more than 1 package manager eligible
    const pm = packageManager[0];
    console.log(`Running ${pm} install command...`);
    execSync(`${pm} install`, { encoding: 'utf8', cwd: path });
  }

  private getPackageManager(packageJsonPath: string, nxPath: string): PackageManager[] {
    // via corepack
    try {
      const packageJson: PackageJson & { packageManager?: string } = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' }));
      if (packageJson?.packageManager) {
        const pm = packageJson.packageManager.split('@')[0];
        if (pm === 'yarn' || pm === 'pnpm' || pm === 'npm') {
          return [pm];
        }
      }
    } catch (e) {
      // file just doesn't exist
    }

    // via nx configuration
    try {
      const nxConfig: NxJsonConfiguration = JSON.parse(readFileSync(nxPath, { encoding: 'utf8' }));
      if (nxConfig?.cli?.packageManager) {
        return [nxConfig.cli.packageManager];
      }
    } catch (e) {
      // file just doesn't exist
    }

    // via lockfiles
    const packageManager: PackageManager[] = [];
    // pnpm-lock.yaml
    if (lockFileExists('pnpm')) {
      packageManager.push('pnpm');
    }
    // yarn.lock
    if (lockFileExists('yarn')) {
      packageManager.push('yarn');
    }
    // package-lock.json
    if (lockFileExists('npm') || !packageManager.length) {
      packageManager.push('npm');
    }

    return packageManager;
  }

  private updatePackageJson(resolvedPackages: ResolvedPackage[], path: string) {
    const packageJson: PackageJson = JSON.parse(readFileSync(path, { encoding: 'utf8' }));
    if (resolvedPackages.length && !packageJson.dependencies) {
      packageJson.dependencies = {};
    }
    for (const resolvedPackage of resolvedPackages) {
      if (packageJson.peerDependencies?.[resolvedPackage.name]) {
        packageJson.peerDependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
      } else {
        packageJson.dependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
      }
      if (packageJson.devDependencies?.[resolvedPackage.name]) {
        delete packageJson.devDependencies[resolvedPackage.name];
      }
      if (packageJson.optionalDependencies?.[resolvedPackage.name]) {
        delete packageJson.optionalDependencies[resolvedPackage.name];
      }
    }
    writeFileSync(path, JSON.stringify(packageJson), { encoding: 'utf8' });
  }
}
