"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Installer = exports.areResolvedPackages = void 0;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const lock_file_1 = require("nx/src/plugins/js/lock-file/lock-file");
const child_process_1 = require("child_process");
const compare_versions_1 = require("compare-versions");
const user_interactions_1 = require("./user-interactions");
function areResolvedPackages(array) {
    return Array.isArray(array) && (!array.length || !!array[0].semVerInfo);
}
exports.areResolvedPackages = areResolvedPackages;
class Installer {
    // TODO: add different error types that can be caught in main that messages get created there -> only needed when ALL messages should be hidden in unattended
    install(packageManager, path, nxVersion, ngPackages, runMigrations = false) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // nx migrate
            if (nxVersion && this.isToolInstalled('nx')) {
                try {
                    (0, child_process_1.execSync)(`nx migrate ${nxVersion}`, { encoding: 'utf8' });
                    // ask if migrations should be run as user input
                    if (runMigrations) {
                        (0, child_process_1.execSync)(`nx migrate --run-migrations=migrations.json`, { encoding: 'utf8' });
                    }
                }
                catch (e) {
                    (0, user_interactions_1.createMessage)('nx_migrate_failure', user_interactions_1.Severity.ERROR);
                }
            }
            // ng update
            if ((ngPackages === null || ngPackages === void 0 ? void 0 : ngPackages.length) && this.isToolInstalled('ng')) {
                const params = ngPackages.map((rp) => `${rp.name}@${rp.semVerInfo}`).join(' ');
                try {
                    (0, child_process_1.execSync)(`ng update ${params}`, { encoding: 'utf8' });
                }
                catch (e) {
                    (0, user_interactions_1.createMessage)('ng_update_failure', user_interactions_1.Severity.ERROR);
                }
            }
            // installation
            try {
                (0, child_process_1.execSync)(`${packageManager} install`, { encoding: 'utf8', cwd: path });
            }
            catch (e) {
                if (packageManager === 'npm') {
                    (0, user_interactions_1.createMessage)('installation_failure', user_interactions_1.Severity.ERROR);
                }
                else {
                    (0, user_interactions_1.createMessage)(`Package installation failed with ${packageManager}. Retrying with npm...`, user_interactions_1.Severity.ERROR);
                    yield this.install('npm', path, nxVersion, ngPackages, runMigrations);
                }
            }
        });
    }
    getPackageManagers(packageJsonPath, nxPath) {
        var _a;
        const packageManagers = [];
        // via corepack
        try {
            const packageJson = JSON.parse((0, fs_1.readFileSync)(packageJsonPath, { encoding: 'utf8' }));
            if (packageJson === null || packageJson === void 0 ? void 0 : packageJson.packageManager) {
                const pm = packageJson.packageManager.split('@')[0];
                if (pm === 'yarn' || pm === 'pnpm' || (pm === 'npm' && this.isToolInstalled(pm))) {
                    packageManagers.push(pm);
                }
            }
        }
        catch (e) {
            // file just doesn't exist
        }
        // via nx configuration
        try {
            const nxConfig = JSON.parse((0, fs_1.readFileSync)(nxPath, { encoding: 'utf8' }));
            if (((_a = nxConfig === null || nxConfig === void 0 ? void 0 : nxConfig.cli) === null || _a === void 0 ? void 0 : _a.packageManager) && this.isToolInstalled(nxConfig.cli.packageManager)) {
                packageManagers.push(nxConfig.cli.packageManager);
            }
        }
        catch (e) {
            // file just doesn't exist
        }
        // via lockfiles
        // pnpm-lock.yaml
        if ((0, lock_file_1.lockFileExists)('pnpm') && this.isToolInstalled('pnpm')) {
            packageManagers.push('pnpm');
        }
        // yarn.lock
        if ((0, lock_file_1.lockFileExists)('yarn') && this.isToolInstalled('yarn')) {
            packageManagers.push('yarn');
        }
        // always add npm if it is installed (should be)
        if (this.isToolInstalled('npm')) {
            packageManagers.push('npm');
        }
        return packageManagers;
    }
    updatePackageJson(resolvedPackages, path) {
        var _a, _b, _c;
        const packageJson = JSON.parse((0, fs_1.readFileSync)(path, { encoding: 'utf8' }));
        if (resolvedPackages.length && !packageJson.dependencies) {
            packageJson.dependencies = {};
        }
        for (const resolvedPackage of resolvedPackages) {
            if ((_a = packageJson.peerDependencies) === null || _a === void 0 ? void 0 : _a[resolvedPackage.name]) {
                packageJson.peerDependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
            }
            else {
                packageJson.dependencies[resolvedPackage.name] = resolvedPackage.semVerInfo;
            }
            if ((_b = packageJson.devDependencies) === null || _b === void 0 ? void 0 : _b[resolvedPackage.name]) {
                delete packageJson.devDependencies[resolvedPackage.name];
            }
            if ((_c = packageJson.optionalDependencies) === null || _c === void 0 ? void 0 : _c[resolvedPackage.name]) {
                delete packageJson.optionalDependencies[resolvedPackage.name];
            }
        }
        (0, fs_1.writeFileSync)(path, JSON.stringify(packageJson), { encoding: 'utf8' });
    }
    isToolInstalled(tool) {
        try {
            let version;
            if (tool === 'ng') {
                const output = (0, child_process_1.execSync)(`ng version`, { encoding: 'utf8' });
                const versionText = 'Angular: ';
                version = output.slice(output.indexOf(versionText) + versionText.length);
                version = version.slice(0, version.indexOf('\n'));
            }
            else if (tool === 'nx') {
                version = (0, child_process_1.execSync)('nx show --version', { encoding: 'utf8' });
            }
            else {
                version = (0, child_process_1.execSync)(`${tool} -v`, { encoding: 'utf8' });
            }
            return (0, compare_versions_1.validate)(version.trim());
        }
        catch (e) {
            return false;
        }
    }
}
exports.Installer = Installer;
//# sourceMappingURL=installer.js.map