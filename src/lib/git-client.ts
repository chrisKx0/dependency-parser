import { simpleGit, SimpleGit } from 'simple-git';

export class GitClient {
  private git: SimpleGit;

  constructor(private localPath: string) {
    this.git = simpleGit(localPath);
  }

  public async clone(repoPath: string) {
    await this.git.clone(repoPath, this.localPath);
  }


}
