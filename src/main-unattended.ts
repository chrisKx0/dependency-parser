import * as core from '@actions/core';
import * as github from '@actions/github';
import { Context } from '@actions/github/lib/context';

import { ConflictState, Evaluator, GitClient, Installer, State } from './lib';

export async function run(context: Context) {
  // get local path of github workspace and path of the repository
  const localPath = process.env.GITHUB_WORKSPACE || '';
  const repoToken = core.getInput('repo-token');
  const repoPath = `https://${repoToken}@github.com/${context.repo.owner}/${context.repo.repo}.git`;

  // clone git repository
  const gitClient = new GitClient(localPath);
  await gitClient.clone(repoPath);

  // initialize evaluator
  const allowedMajorVersions = parseInt(core.getInput('allowed-major-versions')) || 2;
  const allowPreReleases = core.getInput('allow-pre-releases', { trimWhitespace: true }) === 'true';
  const pinVersions = core.getInput('pin-versions', { trimWhitespace: true }) === 'true';
  const evaluator = new Evaluator(allowedMajorVersions, allowPreReleases, pinVersions);

  // run evaluation
  const openRequirements = await evaluator.prepare({ path: localPath });

  let conflictState: ConflictState;
  try {
    conflictState = await evaluator.evaluate(openRequirements);
  } catch (e) {
    conflictState = { state: State.CONFLICT };
  }

  core.info(JSON.stringify(conflictState));

  // TODO: installation
}

run(github.context);
