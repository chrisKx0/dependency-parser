export declare class GitClient {
    private localPath;
    private git;
    constructor(localPath: string);
    clone(repoPath: string): Promise<void>;
}
