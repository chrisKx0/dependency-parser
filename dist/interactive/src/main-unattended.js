"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const tslib_1 = require("tslib");
const core = tslib_1.__importStar(require("@actions/core"));
const github = tslib_1.__importStar(require("@actions/github"));
const path = tslib_1.__importStar(require("path"));
const lib_1 = require("./lib");
function run(context) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        // get local path of github workspace and path of the repository
        const workspaceRoot = process.env.GITHUB_WORKSPACE || '';
        const repoToken = core.getInput('repo-token');
        const repoPath = `https://${repoToken}@github.com/${context.repo.owner}/${context.repo.repo}.git`;
        // clone git repository
        const gitClient = new lib_1.GitClient(workspaceRoot);
        yield gitClient.clone(repoPath);
        // TODO: add outputs to visualize action progress
        // initialize evaluator
        const allowedMajorVersions = parseInt(core.getInput('allowed-major-versions', { trimWhitespace: true })) || 2;
        const allowPreReleases = core.getInput('allow-pre-releases', { trimWhitespace: true }) === 'true';
        const pinVersions = core.getInput('pin-versions', { trimWhitespace: true }) === 'true';
        const evaluator = new lib_1.Evaluator(allowedMajorVersions, allowPreReleases, pinVersions);
        core.info('Preparing dependency resolution...');
        const packageJsonPath = path.normalize(path.join(workspaceRoot, core.getInput('package-json-path')));
        core.debug(packageJsonPath);
        // run evaluation
        const openRequirements = yield evaluator.prepare({ path: packageJsonPath });
        core.info('Performing dependency resolution...');
        let conflictState;
        try {
            conflictState = yield evaluator.evaluate(openRequirements);
        }
        catch (e) {
            conflictState = { state: lib_1.State.CONFLICT };
        }
        core.info(JSON.stringify(conflictState));
        // TODO: installation
    });
}
exports.run = run;
run(github.context);
//# sourceMappingURL=main-unattended.js.map