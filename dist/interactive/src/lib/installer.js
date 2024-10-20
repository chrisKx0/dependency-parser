"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Installer = exports.areResolvedPackages = void 0;
const tslib_1 = require("tslib");
const child_process_1 = require("child_process");
const compare_versions_1 = require("compare-versions");
const fs_1 = require("fs");
const lock_file_1 = require("nx/src/plugins/js/lock-file/lock-file");
const util_1 = require("./util");
/**
 * checks if an array consists of elements of type ResolvedPackage
 * @param array array of ResolvedPackage or PackageRequirement type
 */
function areResolvedPackages(array) {
    return Array.isArray(array) && (!array.length || !!array[0].semVerInfo);
}
exports.areResolvedPackages = areResolvedPackages;
class Installer {
    /**
     * creates a new metrics file in file system
     * @param metrics the metrics of the last evaluation run
     * @param packageJsonPath path to package.json file to retrieve repository name
     */
    createMetricsFile(metrics, packageJsonPath) {
        const packageJson = JSON.parse((0, fs_1.readFileSync)(packageJsonPath, { encoding: 'utf8' }));
        let metricsString = `repository: ${packageJson.name || 'unknown'}\n\n`;
        // format metrics to be more human-readable
        for (const [metric, value] of Object.entries(metrics)) {
            metricsString += `${metric.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${value}\n`;
        }
        const path = __dirname + '/../../data';
        if (!(0, fs_1.existsSync)(path)) {
            (0, fs_1.mkdirSync)(path);
        }
        (0, fs_1.writeFileSync)(`${path}/metrics_log_${Date.now()}.txt`, metricsString, { encoding: 'utf8' });
    }
    /**
     * runs installations via package managers and migration tools
     * @param packageManager the used package manager
     * @param path path in which installation should be run (where package.json lies)
     * @param nxVersion version to which Nx packages are updated to
     * @param ngPackages updated Angular packages with their versions
     * @param runMigrations if actual migrations should be performed
     */
    install(packageManager, path, nxVersion, ngPackages, runMigrations = false) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // run nx migrate if nx versions are updated
            if (nxVersion && this.isToolInstalled('nx')) {
                try {
                    (0, child_process_1.execSync)(`nx migrate ${nxVersion}`, { encoding: 'utf8' });
                    // user choice, if actual migrations should be run
                    if (runMigrations) {
                        (0, child_process_1.execSync)(`nx migrate --run-migrations=migrations.json`, { encoding: 'utf8' });
                    }
                }
                catch (e) {
                    (0, util_1.createMessage)('nx_migrate_failure', util_1.Severity.ERROR);
                }
            }
            // run ng update if Angular versions are updated
            if ((ngPackages === null || ngPackages === void 0 ? void 0 : ngPackages.length) && this.isToolInstalled('ng')) {
                const params = ngPackages.map((rp) => `${rp.name}@${rp.semVerInfo}`).join(' ');
                try {
                    (0, child_process_1.execSync)(`ng update ${params}`, { encoding: 'utf8' });
                }
                catch (e) {
                    (0, util_1.createMessage)('ng_update_failure', util_1.Severity.ERROR);
                }
            }
            // installation of packages via chosen package manager
            try {
                (0, child_process_1.execSync)(`${packageManager} install`, { encoding: 'utf8', cwd: path });
            }
            catch (e) {
                if (packageManager === 'npm') {
                    (0, util_1.createMessage)('installation_failure', util_1.Severity.ERROR);
                }
                else {
                    // on failure, always retry installation with npm, because it should always be installed
                    (0, util_1.createMessage)(`Package installation failed with ${packageManager}. Retrying with npm...`, util_1.Severity.ERROR);
                    yield this.install('npm', path, nxVersion, ngPackages, runMigrations);
                }
            }
        });
    }
    /**
     * try to find eligible package manager through various means
     * @param packageJsonPath path to the package.json file
     * @param nxPath path to the nx.json file
     */
    getPackageManagers(packageJsonPath, nxPath) {
        var _a;
        const packageManagers = [];
        // try to retrieve package manager via corepack (packageManager entry in package.json)
        try {
            const packageJson = JSON.parse((0, fs_1.readFileSync)(packageJsonPath, { encoding: 'utf8' }));
            if (packageJson === null || packageJson === void 0 ? void 0 : packageJson.packageManager) {
                const pm = packageJson.packageManager.split('@')[0];
                // add package manager to eligible package managers if it exists and is installed
                if (pm === 'yarn' || pm === 'pnpm' || (pm === 'npm' && this.isToolInstalled('npm'))) {
                    packageManagers.push(pm);
                }
            }
        }
        catch (e) {
            // best practice if file doesn't exist
        }
        // try to retrieve package manager via nx configuration in nx.json
        try {
            const nxConfig = JSON.parse((0, fs_1.readFileSync)(nxPath, { encoding: 'utf8' }));
            // add package manager to eligible package managers if it exists and is installed
            if (((_a = nxConfig === null || nxConfig === void 0 ? void 0 : nxConfig.cli) === null || _a === void 0 ? void 0 : _a.packageManager) && this.isToolInstalled(nxConfig.cli.packageManager)) {
                packageManagers.push(nxConfig.cli.packageManager);
            }
        }
        catch (e) {
            // best practice if file doesn't exist
        }
        // try to retrieve package manager via lockfiles if the file exists and the package manager is istalled
        // pnpm-lock.yaml
        if ((0, lock_file_1.lockFileExists)('pnpm') && this.isToolInstalled('pnpm')) {
            packageManagers.push('pnpm');
        }
        // yarn.lock
        if ((0, lock_file_1.lockFileExists)('yarn') && this.isToolInstalled('yarn')) {
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
     * @param additionalPackagesToInstall names of the additionally installed packages via install command
     * @param path path to the package.json file
     */
    updatePackageJson(resolvedPackages, additionalPackagesToInstall, path) {
        var _a, _b;
        const packageJson = JSON.parse((0, fs_1.readFileSync)(path, { encoding: 'utf8' }));
        // go through existing peer dependencies and dependencies and update their versions
        for (const resolvedPackage of resolvedPackages) {
            if ((_a = packageJson.peerDependencies) === null || _a === void 0 ? void 0 : _a[resolvedPackage.name]) {
                packageJson.peerDependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
            }
            else if ((_b = packageJson.dependencies) === null || _b === void 0 ? void 0 : _b[resolvedPackage.name]) {
                packageJson.dependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
            }
            else if (additionalPackagesToInstall.includes(resolvedPackage.name)) {
                if (!packageJson.dependencies) {
                    packageJson.dependencies = {};
                }
                packageJson.dependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
            }
        }
        // sort dependencies if some were added
        if (additionalPackagesToInstall.length) {
            packageJson.dependencies = Object.fromEntries(Object.entries(packageJson.dependencies).sort((a, b) => a[0].localeCompare(b[0])));
        }
        (0, fs_1.writeFileSync)(path, JSON.stringify(packageJson, null, 2) + '\n', { encoding: 'utf8' });
    }
    /**
     * checks whether an update tool is installed or not
     * @param tool name of the update tool (npm, pnpm, yarn, ng and nx)
     * @private
     */
    isToolInstalled(tool) {
        try {
            let version;
            if (tool === 'ng') {
                // try to get Angular version via ng command
                const output = (0, child_process_1.execSync)(`ng version`, { encoding: 'utf8' });
                const versionText = 'Angular: ';
                version = output.slice(output.indexOf(versionText) + versionText.length);
                version = version.slice(0, version.indexOf('\n'));
            }
            else if (tool === 'nx') {
                // try to get Nx version through nx command
                version = (0, child_process_1.execSync)('nx show --version', { encoding: 'utf8' });
            }
            else {
                // try to get package manager versions through command line
                version = (0, child_process_1.execSync)(`${tool} -v`, { encoding: 'utf8' });
            }
            // if the command can be performed and returns a valid semver version, tool is installed
            return (0, compare_versions_1.validate)(version.trim());
        }
        catch (e) {
            return false;
        }
    }
}
exports.Installer = Installer;
//# sourceMappingURL=installer.js.map