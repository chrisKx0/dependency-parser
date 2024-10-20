#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const clui_1 = require("clui");
const lodash_1 = require("lodash");
const yargs_1 = tslib_1.__importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const lib_1 = require("./lib");
function run(args) {
    var _a, _b, _c, _d;
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        // get command line arguments and initial user inputs
        const collectMetrics = !!args[lib_1.ArgumentType.COLLECT_METRICS];
        const force = !!args[lib_1.ArgumentType.FORCE];
        const showPrompts = !args[lib_1.ArgumentType.SKIP_PROMPTS];
        const allowedMajorVersions = (_a = args[lib_1.ArgumentType.MAJOR_VERSIONS]) !== null && _a !== void 0 ? _a : (!showPrompts ? 2 : yield (0, lib_1.promptQuestion)('major_version_count'));
        const allowedMinorAndPatchVersions = (_b = args[lib_1.ArgumentType.MINOR_VERSIONS]) !== null && _b !== void 0 ? _b : (!showPrompts ? 10 : yield (0, lib_1.promptQuestion)('minor_version_count'));
        const allowPreReleases = args[lib_1.ArgumentType.PRE_RELEASE] != null
            ? !!args[lib_1.ArgumentType.PRE_RELEASE]
            : !showPrompts || (yield (0, lib_1.promptQuestion)('allow_pre_releases'));
        const pinVersions = args[lib_1.ArgumentType.KEEP_VERSIONS] != null
            ? !!args[lib_1.ArgumentType.KEEP_VERSIONS]
            : showPrompts && (yield (0, lib_1.promptQuestion)('keep_versions'));
        // initialize excluded and included packages
        const excludedPackages = (args[lib_1.ArgumentType.EXCLUDE] || []).map(lib_1.getPackageRegex).filter((ep) => ep);
        const includedPackages = (args[lib_1.ArgumentType.INCLUDE] || []).map(lib_1.getPackageRegex).filter((ep) => ep);
        // initialize evaluator
        const evaluator = new lib_1.Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions, force);
        let startTime;
        let endTime;
        // show spinner during preparation
        let spinner = new clui_1.Spinner('Preparing dependency resolution...');
        spinner.start();
        startTime = performance.now();
        // perform preparation to get initial open requirements
        // eslint-disable-next-line prefer-const
        let { openRequirements, additionalPackagesToInstall } = yield evaluator.prepare(args, excludedPackages, includedPackages);
        endTime = performance.now();
        // calculate duration of preparation with start and end times
        const durationPreparation = (endTime - startTime) / 1000;
        spinner.stop();
        // user choice of the packages to be included in package resolution
        if (showPrompts && !args[lib_1.ArgumentType.ALL_DEPENDENCIES]) {
            const names = openRequirements.map((pr) => pr.name).sort();
            const requirementsToConsider = yield (0, lib_1.promptQuestion)('choose_dependencies_to_resolve', names, names);
            openRequirements = openRequirements.filter((pr) => requirementsToConsider.includes(pr.name));
        }
        else {
            // create command line output of open requirements
            (0, lib_1.createOpenRequirementOutput)(openRequirements);
        }
        // show spinner during dependency resolution
        spinner = new clui_1.Spinner('Performing dependency resolution...');
        spinner.start();
        startTime = performance.now();
        let result;
        let conflictState = { state: lib_1.State.CONFLICT };
        try {
            // perform evaluation to get resolved packages
            result = yield evaluator.evaluate(openRequirements);
            conflictState = result.conflictState;
            spinner.stop();
        }
        catch (e) {
            spinner.stop();
            (0, lib_1.createMessage)(e.message, lib_1.Severity.ERROR);
        }
        endTime = performance.now();
        // calculate duration of evaluation with start and end times
        const durationEvaluation = (endTime - startTime) / 1000;
        // perform post install steps if no conflict has arisen
        if (conflictState.state === 'OK' && (0, lib_1.areResolvedPackages)(conflictState.result)) {
            (0, lib_1.createResolvedPackageOutput)(conflictState.result);
            const installer = new lib_1.Installer();
            // get paths of package.json and nx.json
            const path = (_c = args[lib_1.ArgumentType.PATH]) !== null && _c !== void 0 ? _c : process.cwd();
            const packageJsonPath = path + '/package.json';
            const nxPath = path + '/nx.json';
            if (collectMetrics) {
                // create metrics file when flag was set
                installer.createMetricsFile(Object.assign(Object.assign({}, result.metrics), { durationPreparation, durationEvaluation }), packageJsonPath);
            }
            // user choice if package.json should be updated
            if (!(args[lib_1.ArgumentType.MODIFY_JSON] != null
                ? !!args[lib_1.ArgumentType.MODIFY_JSON]
                : !showPrompts || (yield (0, lib_1.promptQuestion)('modify_package_json')))) {
                return;
            }
            installer.updatePackageJson(conflictState.result, additionalPackagesToInstall, packageJsonPath);
            // user choice if dependencies should be installed
            if (!(args[lib_1.ArgumentType.INSTALL] != null
                ? !!args[lib_1.ArgumentType.INSTALL]
                : !showPrompts || (yield (0, lib_1.promptQuestion)('install_dependencies')))) {
                return;
            }
            // get package manager choice either by command line option or other means
            let packageManager;
            if (args[lib_1.ArgumentType.PACKAGE_MANAGER] === 'yarn' ||
                args[lib_1.ArgumentType.PACKAGE_MANAGER] === 'pnpm' ||
                args[lib_1.ArgumentType.PACKAGE_MANAGER] === 'npm') {
                packageManager = args[lib_1.ArgumentType.PACKAGE_MANAGER];
            }
            else {
                // get all possible package managers and let the user choose one (or show warning)
                const packageManagers = installer.getPackageManagers(packageJsonPath, nxPath);
                if (!packageManagers.length) {
                    (0, lib_1.createMessage)('missing_package_manager', lib_1.Severity.WARNING);
                    return;
                }
                packageManager = showPrompts
                    ? yield (0, lib_1.promptQuestion)('choose_package_manager', (0, lodash_1.uniq)(packageManagers))
                    : packageManagers[0];
            }
            // get nx and Angular versions (if their packages will be installed) and ask user if migrations should be made
            const nxVersion = (_d = conflictState.result.find((rp) => rp.name.startsWith('@nx'))) === null || _d === void 0 ? void 0 : _d.semVerInfo;
            const ngPackages = conflictState.result.filter((rp) => rp.name.startsWith('@angular'));
            const runMigrations = args[lib_1.ArgumentType.MIGRATE] != null ? !!args[lib_1.ArgumentType.MIGRATE] : showPrompts && (yield (0, lib_1.promptQuestion)('run_migrations'));
            // show spinner during installation
            spinner = new clui_1.Spinner(`Performing installation with ${packageManager}...`);
            spinner.start();
            // perform installation with all retrieved parameters
            yield installer.install(packageManager, path, nxVersion, ngPackages, runMigrations);
            spinner.stop();
        }
        else {
            // if conflict did arise, show error message and ask the user if it should be retried (with different parameters)
            (0, lib_1.createMessage)('resolution_failure', lib_1.Severity.ERROR);
            const retry = args[lib_1.ArgumentType.RETRY] != null ? !!args[lib_1.ArgumentType.RETRY] : showPrompts && (yield (0, lib_1.promptQuestion)('try_again'));
            if (retry) {
                run(args);
            }
        }
    });
}
// initialize CLI with commands and options via yargs
(0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .command(['update', 'u'], 'Updates all peer dependencies by heuristics', {}, (args) => {
    run(args);
})
    .command(['install', 'i'], 'Updates all peer dependencies by given versions', {}, (args) => {
    run(args);
})
    .option(lib_1.ArgumentType.ALL_DEPENDENCIES, {
    alias: 'a',
    type: 'boolean',
    boolean: true,
    description: 'Resolve all dependencies of package.json',
})
    .option(lib_1.ArgumentType.COLLECT_METRICS, {
    alias: 'c',
    type: 'boolean',
    boolean: true,
    description: 'Collect performance metrics and save to file',
})
    .option(lib_1.ArgumentType.EXCLUDE, {
    type: 'array',
    array: true,
    description: 'Packages to exclude from evaluation',
})
    .option(lib_1.ArgumentType.FORCE, {
    alias: 'f',
    type: 'boolean',
    boolean: true,
    description: 'Forcibly try every version combination',
})
    .option(lib_1.ArgumentType.INCLUDE, {
    type: 'array',
    array: true,
    description: 'Packages to take into account in evaluation',
})
    .option(lib_1.ArgumentType.INSTALL, {
    alias: 'i',
    type: 'boolean',
    boolean: true,
    description: 'Install the resolved dependencies with package manager',
})
    .option(lib_1.ArgumentType.MAJOR_VERSIONS, {
    type: 'number',
    number: true,
    description: 'Number of major versions allowed to downgrade',
})
    .option(lib_1.ArgumentType.MINOR_VERSIONS, {
    type: 'number',
    number: true,
    description: 'Number of minor versions allowed per major version',
})
    .option(lib_1.ArgumentType.MIGRATE, {
    alias: 'm',
    type: 'boolean',
    boolean: true,
    description: 'Run migrations generated by migration tools',
})
    .option(lib_1.ArgumentType.MODIFY_JSON, {
    alias: 'j',
    type: 'boolean',
    boolean: true,
    description: 'Modify the package.json file after resolution',
})
    .option(lib_1.ArgumentType.PACKAGE_MANAGER, {
    type: 'string',
    string: true,
    description: 'The package manager used for installation',
    choices: ['npm', 'pnpm', 'yarn'],
})
    .option(lib_1.ArgumentType.PATH, {
    type: 'string',
    string: true,
    description: 'Path of the package.json file',
})
    .option(lib_1.ArgumentType.KEEP_VERSIONS, {
    alias: 'k',
    type: 'boolean',
    boolean: true,
    description: 'Keep the versions specified in package.json',
})
    .option(lib_1.ArgumentType.PRE_RELEASE, {
    alias: 'p',
    type: 'boolean',
    boolean: true,
    description: 'Allow dependencies with pre-release versions (e.g. beta versions)',
})
    .option(lib_1.ArgumentType.RETRY, {
    alias: 'r',
    type: 'boolean',
    boolean: true,
    description: 'Retry after failed attempts',
})
    .option(lib_1.ArgumentType.SKIP_PROMPTS, {
    alias: 's',
    type: 'boolean',
    boolean: true,
    description: 'Skip all user prompts',
})
    .parse();
//# sourceMappingURL=main-interactive.js.map