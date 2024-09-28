"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const tslib_1 = require("tslib");
const core = tslib_1.__importStar(require("@actions/core"));
const path = tslib_1.__importStar(require("path"));
const lib_1 = require("./lib");
function run() {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        // get path of the package.json file inside the workspace
        const workspaceRoot = process.env.GITHUB_WORKSPACE || '';
        const packageJsonPath = path.normalize(path.join(workspaceRoot, core.getInput('package-json-path')));
        // initialize evaluator
        const allowedMajorVersions = parseInt(core.getInput('allowed-major-versions', { trimWhitespace: true })) || 2;
        const allowedMinorAndPatchVersions = parseInt(core.getInput('allowed-minor-versions', { trimWhitespace: true })) || 10;
        const allowPreReleases = core.getInput('allow-pre-releases', { trimWhitespace: true }) === 'true';
        const pinVersions = core.getInput('keep-versions', { trimWhitespace: true }) === 'true';
        const evaluator = new lib_1.Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions);
        core.info('-- Preparing dependency resolution --');
        // run preparation
        const openRequirements = yield evaluator.prepare({ path: packageJsonPath });
        (0, lib_1.createOpenRequirementOutput)(openRequirements, false);
        core.info('-- Performing dependency resolution --');
        // run evaluation
        let conflictState;
        try {
            const result = yield evaluator.evaluate(openRequirements);
            conflictState = result.conflictState;
        }
        catch (e) {
            conflictState = { state: lib_1.State.CONFLICT };
        }
        if (conflictState.state === 'OK' && (0, lib_1.areResolvedPackages)(conflictState.result)) {
            (0, lib_1.createResolvedPackageOutput)(conflictState.result, false);
            const installer = new lib_1.Installer();
            installer.updatePackageJson(conflictState.result, packageJsonPath + '/package.json');
        }
        else {
            core.error('Unable to evaluate dependencies with the provided parameters');
        }
    });
}
exports.run = run;
run();
//# sourceMappingURL=main-unattended.js.map