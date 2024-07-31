"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitClient = void 0;
const tslib_1 = require("tslib");
const simple_git_1 = require("simple-git");
class GitClient {
    constructor(localPath) {
        this.localPath = localPath;
        this.git = (0, simple_git_1.simpleGit)(localPath);
    }
    clone(repoPath) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this.git.clone(repoPath, this.localPath);
        });
    }
}
exports.GitClient = GitClient;
//# sourceMappingURL=git-client.js.map