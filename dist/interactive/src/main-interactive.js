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
        // initial user inputs
        const collectMetrics = !!args[lib_1.ArgumentType.COLLECT_METRICS];
        const force = !!args[lib_1.ArgumentType.FORCE];
        const showPrompts = !args[lib_1.ArgumentType.SKIP_PROMPTS];
        const allowedMajorVersions = (_a = args[lib_1.ArgumentType.MAJOR_VERSIONS]) !== null && _a !== void 0 ? _a : (!showPrompts ? 2 : yield (0, lib_1.promptQuestion)('major_version_count'));
        const allowedMinorAndPatchVersions = (_b = args[lib_1.ArgumentType.MINOR_VERSIONS]) !== null && _b !== void 0 ? _b : (!showPrompts ? 10 : yield (0, lib_1.promptQuestion)('minor_version_count'));
        const allowPreReleases = args[lib_1.ArgumentType.PRE_RELEASE] != null
            ? !!args[lib_1.ArgumentType.PRE_RELEASE]
            : showPrompts && (yield (0, lib_1.promptQuestion)('allow_pre_releases'));
        const pinVersions = args[lib_1.ArgumentType.KEEP_VERSIONS] != null
            ? !!args[lib_1.ArgumentType.KEEP_VERSIONS]
            : showPrompts && (yield (0, lib_1.promptQuestion)('keep_versions'));
        // initialize evaluator
        const evaluator = new lib_1.Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions, force);
        let startTime;
        let endTime;
        // show spinner during preparation
        let spinner = new clui_1.Spinner('Preparing dependency resolution...');
        spinner.start();
        startTime = performance.now();
        let openRequirements = yield evaluator.prepare(args);
        endTime = performance.now();
        const durationPreparation = (endTime - startTime) / 1000;
        spinner.stop();
        // let user choose the packages he likes to include in package resolution
        if (showPrompts && !args[lib_1.ArgumentType.ALL_DEPENDENCIES]) {
            const names = openRequirements.map((pr) => pr.name);
            const requirementsToConsider = yield (0, lib_1.promptQuestion)('choose_dependencies_to_resolve', names, names);
            openRequirements = openRequirements.filter((pr) => requirementsToConsider.includes(pr.name));
        }
        else {
            // show open requirements as user output
            (0, lib_1.createOpenRequirementOutput)(openRequirements);
        }
        // show spinner during dependency resolution
        spinner = new clui_1.Spinner('Performing dependency resolution...');
        spinner.start();
        startTime = performance.now();
        let result;
        let conflictState;
        try {
            result = yield evaluator.evaluate(openRequirements);
            conflictState = result.conflictState;
            spinner.stop();
        }
        catch (e) {
            conflictState = { state: lib_1.State.CONFLICT };
            spinner.stop();
            (0, lib_1.createMessage)(e.message, lib_1.Severity.ERROR);
        }
        endTime = performance.now();
        const durationEvaluation = (endTime - startTime) / 1000;
        if (conflictState.state === 'OK' && (0, lib_1.areResolvedPackages)(conflictState.result)) {
            (0, lib_1.createResolvedPackageOutput)(conflictState.result);
            const installer = new lib_1.Installer();
            if (collectMetrics) {
                installer.createMetricsFile(Object.assign(Object.assign({}, result.metrics), { durationPreparation, durationEvaluation }));
            }
            const path = (_c = args[lib_1.ArgumentType.PATH]) !== null && _c !== void 0 ? _c : process.cwd();
            const packageJsonPath = path + '/package.json';
            const nxPath = path + '/nx.json';
            // ask for package.json update as user input
            if (!(args[lib_1.ArgumentType.MODIFY_JSON] != null
                ? !!args[lib_1.ArgumentType.MODIFY_JSON]
                : !showPrompts || (yield (0, lib_1.promptQuestion)('modify_package_json')))) {
                return;
            }
            installer.updatePackageJson(conflictState.result, packageJsonPath);
            // ask for dependency installation as user input
            if (!(args[lib_1.ArgumentType.INSTALL] != null
                ? !!args[lib_1.ArgumentType.INSTALL]
                : !showPrompts || (yield (0, lib_1.promptQuestion)('install_dependencies')))) {
                return;
            }
            let packageManager;
            if (args[lib_1.ArgumentType.PACKAGE_MANAGER] === 'yarn' ||
                args[lib_1.ArgumentType.PACKAGE_MANAGER] === 'pnpm' ||
                args[lib_1.ArgumentType.PACKAGE_MANAGER] === 'npm') {
                packageManager = args[lib_1.ArgumentType.PACKAGE_MANAGER];
            }
            else {
                const packageManagers = installer.getPackageManagers(packageJsonPath, nxPath);
                if (!packageManagers.length) {
                    (0, lib_1.createMessage)('missing_package_manager', lib_1.Severity.WARNING);
                    return;
                }
                packageManager = showPrompts
                    ? yield (0, lib_1.promptQuestion)('choose_package_manager', (0, lodash_1.uniq)(packageManagers))
                    : packageManagers[0];
            }
            const nxVersion = (_d = conflictState.result.find((rp) => rp.name.startsWith(lib_1.PACKAGE_BUNDLES[0]))) === null || _d === void 0 ? void 0 : _d.semVerInfo;
            const ngPackages = conflictState.result.filter((rp) => rp.name.startsWith(lib_1.PACKAGE_BUNDLES[1]));
            const runMigrations = args[lib_1.ArgumentType.MIGRATE] != null ? !!args[lib_1.ArgumentType.MIGRATE] : showPrompts && (yield (0, lib_1.promptQuestion)('run_migrations'));
            // show spinner during installation
            spinner = new clui_1.Spinner(`Performing installation with ${packageManager}...`);
            spinner.start();
            yield installer.install(packageManager, path, nxVersion, ngPackages, runMigrations);
            spinner.stop();
        }
        else {
            (0, lib_1.createMessage)('resolution_failure', lib_1.Severity.ERROR);
            const retry = args[lib_1.ArgumentType.RETRY] != null ? !!args[lib_1.ArgumentType.RETRY] : showPrompts && (yield (0, lib_1.promptQuestion)('try_again'));
            if (retry) {
                run(args);
            }
        }
    });
}
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
    .option(lib_1.ArgumentType.FORCE, {
    alias: 'f',
    type: 'boolean',
    boolean: true,
    description: 'Forcibly try every version combination',
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