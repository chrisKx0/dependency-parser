import { execSync } from 'child_process';
import { validate } from 'compare-versions';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { lockFileExists } from 'nx/src/plugins/js/lock-file/lock-file';
import { NxJsonConfiguration } from 'nx/src/config/nx-json';
import { PackageManager } from 'nx/src/utils/package-manager';
import { PackageJson } from 'nx/src/utils/package-json';

import { createMessage, PackageRequirement, Severity, ResolvedPackage, Metrics } from './util';

/**
 * checks if an array consists of elements of type ResolvedPackage
 * @param array array of ResolvedPackage or PackageRequirement type
 */
export function areResolvedPackages(array: ResolvedPackage[] | PackageRequirement[]): array is ResolvedPackage[] {
  return Array.isArray(array) && (!array.length || !!(array[0] as ResolvedPackage).semVerInfo);
}

export class Installer {
  /**
   * creates a new metrics file in file system
   * @param metrics the metrics of the last evaluation run
   */
  public createMetricsFile(metrics: Metrics) {
    let metricsString = '';
    // format metrics to be more human-readable
    for (const [metric, value] of Object.entries(metrics)) {
      metricsString += `${metric.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${value}\n`;
    }
    const path = __dirname + '/../../data';
    if (!existsSync(path)) {
      mkdirSync(path);
    }
    writeFileSync(`${path}/metrics_log_${Date.now()}.txt`, metricsString, { encoding: 'utf8' });
  }

  /**
   * runs installations via package managers and migration tools
   * @param packageManager the used package manager
   * @param path path in which installation should be run (where package.json lies)
   * @param nxVersion version to which Nx packages are updated to
   * @param ngPackages updated Angular packages with their versions
   * @param runMigrations if actual migrations should be performed
   */
  public async install(packageManager: string, path: string, nxVersion?: string, ngPackages?: ResolvedPackage[], runMigrations = false) {
    // run nx migrate if nx versions are updated
    if (nxVersion && this.isToolInstalled('nx')) {
      try {
        execSync(`nx migrate ${nxVersion}`, { encoding: 'utf8' });
        // user choice, if actual migrations should be run
        if (runMigrations) {
          execSync(`nx migrate --run-migrations=migrations.json`, { encoding: 'utf8' });
        }
      } catch (e) {
        createMessage('nx_migrate_failure', Severity.ERROR);
      }
    }

    // run ng update if Angular versions are updated
    if (ngPackages?.length && this.isToolInstalled('ng')) {
      const params = ngPackages.map((rp) => `${rp.name}@${rp.semVerInfo}`).join(' ');
      try {
        execSync(`ng update ${params}`, { encoding: 'utf8' });
      } catch (e) {
        createMessage('ng_update_failure', Severity.ERROR);
      }
    }

    // installation of packages via chosen package manager
    try {
      execSync(`${packageManager} install`, { encoding: 'utf8', cwd: path });
    } catch (e) {
      if (packageManager === 'npm') {
        createMessage('installation_failure', Severity.ERROR);
      } else {
        // on failure, always retry installation with npm, because it should always be installed
        createMessage(`Package installation failed with ${packageManager}. Retrying with npm...`, Severity.ERROR);
        await this.install('npm', path, nxVersion, ngPackages, runMigrations);
      }
    }
  }

  /**
   * try to find eligible package manager through various means
   * @param packageJsonPath path to the package.json file
   * @param nxPath path to the nx.json file
   */
  public getPackageManagers(packageJsonPath: string, nxPath: string): PackageManager[] {
    const packageManagers: PackageManager[] = [];

    // try to retrieve package manager via corepack (packageManager entry in package.json)
    try {
      const packageJson: PackageJson & { packageManager?: string } = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' }));
      if (packageJson?.packageManager) {
        const pm = packageJson.packageManager.split('@')[0];
        // add package manager to eligible package managers if it exists and is installed
        if (pm === 'yarn' || pm === 'pnpm' || (pm === 'npm' && this.isToolInstalled('npm'))) {
          packageManagers.push(pm);
        }
      }
    } catch (e) {
      // best practice if file doesn't exist
    }

    // try to retrieve package manager via nx configuration in nx.json
    try {
      const nxConfig: NxJsonConfiguration = JSON.parse(readFileSync(nxPath, { encoding: 'utf8' }));
      // add package manager to eligible package managers if it exists and is installed
      if (nxConfig?.cli?.packageManager && this.isToolInstalled(nxConfig.cli.packageManager)) {
        packageManagers.push(nxConfig.cli.packageManager);
      }
    } catch (e) {
      // best practice if file doesn't exist
    }

    // try to retrieve package manager via lockfiles if the file exists and the package manager is istalled

    // pnpm-lock.yaml
    if (lockFileExists('pnpm') && this.isToolInstalled('pnpm')) {
      packageManagers.push('pnpm');
    }
    // yarn.lock
    if (lockFileExists('yarn') && this.isToolInstalled('yarn')) {
      packageManagers.push('yarn');
    }
    // always add npm if it is installed (as fallback)
    if (this.isToolInstalled('npm')) {
      packageManagers.push('npm');
    }

    return packageManagers;
  }

  /**
   * updates the package.json file with the resolved package versions
   * @param resolvedPackages resolved packages with their versions
   * @param path path to the package.json file
   */
  public updatePackageJson(resolvedPackages: ResolvedPackage[], path: string) {
    const packageJson: PackageJson = JSON.parse(readFileSync(path, { encoding: 'utf8' }));

    // go through existing peer dependencies and dependencies and update their versions
    for (const resolvedPackage of resolvedPackages) {
      if (packageJson.peerDependencies?.[resolvedPackage.name]) {
        packageJson.peerDependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
      } else if (packageJson.dependencies?.[resolvedPackage.name]) {
        packageJson.dependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
      }
    }

    writeFileSync(path, JSON.stringify(packageJson, null, 2) + '\n', { encoding: 'utf8' });
  }

  /**
   * checks whether an update tool is installed or not
   * @param tool name of the update tool (npm, pnpm, yarn, ng and nx)
   * @private
   */
  private isToolInstalled(tool: PackageManager | 'ng' | 'nx') {
    try {
      let version: string;
      if (tool === 'ng') {
        // try to get Angular version via ng command
        const output = execSync(`ng version`, { encoding: 'utf8' });
        const versionText = 'Angular: ';
        version = output.slice(output.indexOf(versionText) + versionText.length);
        version = version.slice(0, version.indexOf('\n'));
      } else if (tool === 'nx') {
        // try to get Nx version through nx command
        version = execSync('nx show --version', { encoding: 'utf8' });
      } else {
        // try to get package manager versions through command line
        version = execSync(`${tool} -v`, { encoding: 'utf8' });
      }
      // if the command can be performed and returns a valid semver version, tool is installed
      return validate(version.trim());
    } catch (e) {
      return false;
    }
  }
}
