import { readFileSync, writeFileSync } from 'fs';
import { PackageManager } from 'nx/src/utils/package-manager';
import { NxJsonConfiguration } from 'nx/src/config/nx-json';
import { lockFileExists } from 'nx/src/plugins/js/lock-file/lock-file';

import { PACKAGE_BUNDLES, ResolvedPackage } from './evaluator.interface';
import { PackageJson } from 'nx/src/utils/package-json';
import { execSync } from 'child_process';
import { validate } from 'compare-versions';
import { createMessage, promptQuestion, Severity } from './user-interactions';
import { uniq } from 'lodash';

export class Installer {
  public async install(resolvedPackages: ResolvedPackage[], path?: string, packageManager?: PackageManager) {
    path = path ?? process.cwd();
    const packageJsonPath = path + '/package.json';
    const nxPath = path + '/nx.json';

    // ask for package.json update as user input
    if (!(await promptQuestion<boolean>('modify_package_json'))) {
      return;
    }

    this.updatePackageJson(resolvedPackages, packageJsonPath);

    // ask for dependency installation as user input
    if (!(await promptQuestion<boolean>('install_dependencies'))) {
      return;
    }

    if (!packageManager) {
      packageManager = await this.getPackageManager(packageJsonPath, nxPath);
    }

    const nxVersion = resolvedPackages.find((rp) => rp.name.startsWith(PACKAGE_BUNDLES[0]))?.semVerInfo;
    const ngPackages = resolvedPackages.filter((rp) => rp.name.startsWith(PACKAGE_BUNDLES[1]));

    this.installPackages(packageManager, path, nxVersion, ngPackages);
  }

  private async installPackages(packageManager: string, path: string, nxVersion?: string, ngPackages?: ResolvedPackage[]) {
    // nx migrate
    if (nxVersion && this.isToolInstalled('nx')) {
      try {
        execSync(`nx migrate ${nxVersion}`, { encoding: 'utf8' });
        // ask if migrations should be run as user input
        if (await promptQuestion<boolean>('run_migrations')) {
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
    createMessage(`Running ${packageManager} install command...`);
    try {
      execSync(`${packageManager} install`, { encoding: 'utf8', cwd: path });
    } catch (e) {
      if (packageManager === 'npm') {
        createMessage('installation_failure', Severity.ERROR);
      } else {
        createMessage(`Package installation failed with ${packageManager}. Retrying with npm...`, Severity.ERROR);
        this.installPackages('npm', path);
      }
    }
  }

  private async getPackageManager(packageJsonPath: string, nxPath: string): Promise<PackageManager> {
    const packageManager: PackageManager[] = [];

    // via corepack
    try {
      const packageJson: PackageJson & { packageManager?: string } = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' }));
      if (packageJson?.packageManager) {
        const pm = packageJson.packageManager.split('@')[0];
        if (pm === 'yarn' || pm === 'pnpm' || (pm === 'npm' && this.isToolInstalled(pm))) {
          packageManager.push(pm);
        }
      }
    } catch (e) {
      // file just doesn't exist
    }

    // via nx configuration
    try {
      const nxConfig: NxJsonConfiguration = JSON.parse(readFileSync(nxPath, { encoding: 'utf8' }));
      if (nxConfig?.cli?.packageManager && this.isToolInstalled(nxConfig.cli.packageManager)) {
        packageManager.push(nxConfig.cli.packageManager);
      }
    } catch (e) {
      // file just doesn't exist
    }

    // via lockfiles

    // pnpm-lock.yaml
    if (lockFileExists('pnpm') && this.isToolInstalled('pnpm')) {
      packageManager.push('pnpm');
    }
    // yarn.lock
    if (lockFileExists('yarn') && this.isToolInstalled('yarn')) {
      packageManager.push('yarn');
    }
    // always add npm if it is installed (should be)
    if (this.isToolInstalled('npm')) {
      packageManager.push('npm');
    }

    if (!packageManager.length) {
      createMessage('missing_package_manager', Severity.WARNING);
      return;
    }

    return promptQuestion<PackageManager>('choose_package_manager', uniq(packageManager));
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
