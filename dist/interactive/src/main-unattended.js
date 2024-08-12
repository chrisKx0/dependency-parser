"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const tslib_1 = require("tslib");
const core = tslib_1.__importStar(require("@actions/core"));
// import * as github from '@actions/github';
const path = tslib_1.__importStar(require("path"));
// import { Context } from '@actions/github/lib/context';
const lib_1 = require("./lib");
function run() {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        // get paths of github workspace, the repository and the package.json file inside the workspace
        const workspaceRoot = process.env.GITHUB_WORKSPACE || '';
        // const repoToken = core.getInput('repo-token');
        // const repoPath = `https://${repoToken}@github.com/${context.repo.owner}/${context.repo.repo}.git`;
        const packageJsonPath = path.normalize(path.join(workspaceRoot, 'package.json')); // core.getInput('package-json-path')
        // clone git repository
        // const gitClient = new GitClient(workspaceRoot);
        // await gitClient.clone(repoPath);
        // initialize evaluator
        const allowedMajorVersions = parseInt(core.getInput('allowed-major-versions', { trimWhitespace: true })) || 2;
        const allowedMinorAndPatchVersions = parseInt(core.getInput('allowed-minor-versions', { trimWhitespace: true })) || 10;
        const allowPreReleases = core.getInput('allow-pre-releases', { trimWhitespace: true }) === 'true';
        const pinVersions = core.getInput('pin-versions', { trimWhitespace: true }) === 'true';
        const evaluator = new lib_1.Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions);
        core.info('Preparing dependency resolution...');
        // run preparation
        const openRequirements = yield evaluator.prepare({ path: packageJsonPath });
        core.info('Performing dependency resolution...');
        // run evaluation
        let conflictState;
        try {
            conflictState = yield evaluator.evaluate(openRequirements);
        }
        catch (e) {
            conflictState = { state: lib_1.State.CONFLICT };
        }
        // TODO: better output
        core.info(JSON.stringify(conflictState));
        const installer = new lib_1.Installer();
        if (conflictState.state === 'OK' && (0, lib_1.areResolvedPackages)(conflictState.result)) {
            installer.updatePackageJson(conflictState.result, packageJsonPath);
        }
        // TODO: create branch + commit + pr
    });
}
exports.run = run;
run();
//# sourceMappingURL=main-unattended.js.map