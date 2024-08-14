import { readFileSync, writeFileSync } from 'fs';
import { PackageManager } from 'nx/src/utils/package-manager';
import { NxJsonConfiguration } from 'nx/src/config/nx-json';
import { lockFileExists } from 'nx/src/plugins/js/lock-file/lock-file';

import { PackageRequirement, ResolvedPackage } from './interfaces';
import { PackageJson } from 'nx/src/utils/package-json';
import { execSync } from 'child_process';
import { validate } from 'compare-versions';
import { createMessage, Severity } from './user-interactions';

export function areResolvedPackages(array: ResolvedPackage[] | PackageRequirement[]): array is ResolvedPackage[] {
  return Array.isArray(array) && (!array.length || !!(array[0] as ResolvedPackage).semVerInfo);
}

export class Installer {
  // TODO: add different error types that can be caught in main that messages get created there -> only needed when ALL messages should be hidden in unattended
  public async install(packageManager: string, path: string, nxVersion?: string, ngPackages?: ResolvedPackage[], runMigrations = false) {
    // nx migrate
    if (nxVersion && this.isToolInstalled('nx')) {
      try {
        execSync(`nx migrate ${nxVersion}`, { encoding: 'utf8' });
        // ask if migrations should be run as user input
        if (runMigrations) {
          execSync(`nx migrate --run-migrations=migrations.json`, { encoding: 'utf8' });
        }
      } catch (e) {
        createMessage('nx_migrate_failure', Severity.ERROR);
      }
    }
    // ng update
    if (ngPackages?.length && this.isToolInstalled('ng')) {
      const params = ngPackages.map((rp) => `${rp.name}@${rp.semVerInfo}`).join(' ');
      try {
        execSync(`ng update ${params}`, { encoding: 'utf8' });
      } catch (e) {
        createMessage('ng_update_failure', Severity.ERROR);
      }
    }

    // installation
    try {
      execSync(`${packageManager} install`, { encoding: 'utf8', cwd: path });
    } catch (e) {
      if (packageManager === 'npm') {
        createMessage('installation_failure', Severity.ERROR);
      } else {
        createMessage(`Package installation failed with ${packageManager}. Retrying with npm...`, Severity.ERROR);
        await this.install('npm', path, nxVersion, ngPackages, runMigrations);
      }
    }
  }

  public getPackageManagers(packageJsonPath: string, nxPath: string): PackageManager[] {
    const packageManagers: PackageManager[] = [];

    // via corepack
    try {
      const packageJson: PackageJson & { packageManager?: string } = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' }));
      if (packageJson?.packageManager) {
        const pm = packageJson.packageManager.split('@')[0];
        if (pm === 'yarn' || pm === 'pnpm' || (pm === 'npm' && this.isToolInstalled(pm))) {
          packageManagers.push(pm);
        }
      }
    } catch (e) {
      // file just doesn't exist
    }

    // via nx configuration
    try {
      const nxConfig: NxJsonConfiguration = JSON.parse(readFileSync(nxPath, { encoding: 'utf8' }));
      if (nxConfig?.cli?.packageManager && this.isToolInstalled(nxConfig.cli.packageManager)) {
        packageManagers.push(nxConfig.cli.packageManager);
      }
    } catch (e) {
      // file just doesn't exist
    }

    // via lockfiles

    // pnpm-lock.yaml
    if (lockFileExists('pnpm') && this.isToolInstalled('pnpm')) {
      packageManagers.push('pnpm');
    }
    // yarn.lock
    if (lockFileExists('yarn') && this.isToolInstalled('yarn')) {
      packageManagers.push('yarn');
    }
    // always add npm if it is installed (should be)
    if (this.isToolInstalled('npm')) {
      packageManagers.push('npm');
    }

    return packageManagers;
  }

  public updatePackageJson(resolvedPackages: ResolvedPackage[], path: string) {
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

      // sort dependencies alphabetically before writing to file
      packageJson.dependencies = Object.fromEntries(
        Object.entries(packageJson.dependencies).sort((a, b) => a[0].localeCompare(b[0])),
      );

      if (packageJson.devDependencies?.[resolvedPackage.name]) {
        delete packageJson.devDependencies[resolvedPackage.name];
      }

      if (packageJson.optionalDependencies?.[resolvedPackage.name]) {
        delete packageJson.optionalDependencies[resolvedPackage.name];
      }
    }
    writeFileSync(path, JSON.stringify(packageJson, null, 2), { encoding: 'utf8' });
  }

  private isToolInstalled(tool: PackageManager | 'ng' | 'nx') {
    try {
      let version: string;
      if (tool === 'ng') {
        const output = execSync(`ng version`, { encoding: 'utf8' });
        const versionText = 'Angular: ';
        version = output.slice(output.indexOf(versionText) + versionText.length);
        version = version.slice(0, version.indexOf('\n'));
      } else if (tool === 'nx') {
        version = execSync('nx show --version', { encoding: 'utf8' });
      } else {
        version = execSync(`${tool} -v`, { encoding: 'utf8' });
      }
      return validate(version.trim());
    } catch (e) {
      return false;
    }
  }
}
