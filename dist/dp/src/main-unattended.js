"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const lib_1 = require("./lib");
// TODO: build before running
function run(context) {
    return __awaiter(this, void 0, void 0, function* () {
        // get local path of github workspace and path of the repository
        const localPath = process.env.GITHUB_WORKSPACE || '';
        const repoToken = core.getInput('repo-token');
        const repoPath = `https://${repoToken}@github.com/${context.repo.owner}/${context.repo.repo}.git`;
        // clone git repository
        const gitClient = new lib_1.GitClient(localPath);
        yield gitClient.clone(repoPath);
        // initialize evaluator
        const allowedMajorVersions = parseInt(core.getInput('allowed-major-versions')) || 2;
        const allowPreReleases = core.getInput('allow-pre-releases', { trimWhitespace: true }) === 'true';
        const pinVersions = core.getInput('pin-versions', { trimWhitespace: true }) === 'true';
        const evaluator = new lib_1.Evaluator(allowedMajorVersions, allowPreReleases, pinVersions);
        // run evaluation
        const openRequirements = yield evaluator.prepare({ path: localPath });
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