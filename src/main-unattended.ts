import * as core from '@actions/core';
import * as github from '@actions/github';
import * as path from 'path';
import { Context } from '@actions/github/lib/context';

import { areResolvedPackages, ConflictState, Evaluator, GitClient, Installer, State } from './lib';

export async function run(context: Context) {
  // get paths of github workspace, the repository and the package.json file inside the workspace
  const workspaceRoot = process.env.GITHUB_WORKSPACE || '';
  const repoToken = core.getInput('repo-token');
  const repoPath = `https://${repoToken}@github.com/${context.repo.owner}/${context.repo.repo}.git`;
  const packageJsonPath = path.normalize(path.join(workspaceRoot, core.getInput('package-json-path')));

  // clone git repository
  const gitClient = new GitClient(workspaceRoot);
  await gitClient.clone(repoPath);

  // initialize evaluator
  const allowedMajorVersions = parseInt(core.getInput('allowed-major-versions', { trimWhitespace: true })) || 2;
  const allowedMinorAndPatchVersions = parseInt(core.getInput('allowed-minor-versions', { trimWhitespace: true })) || 10;
  const allowPreReleases = core.getInput('allow-pre-releases', { trimWhitespace: true }) === 'true';
  const pinVersions = core.getInput('pin-versions', { trimWhitespace: true }) === 'true';
  const evaluator = new Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions);

  core.info('Preparing dependency resolution...');

  // run preparation
  const openRequirements = await evaluator.prepare({ path: packageJsonPath });

  core.info('Performing dependency resolution...');

  // run evaluation
  let conflictState: ConflictState;
  try {
    conflictState = await evaluator.evaluate(openRequirements);
  } catch (e) {
    conflictState = { state: State.CONFLICT };
  }

  // TODO: nicer output
  core.info(JSON.stringify(conflictState));

  const installer = new Installer();
  if (conflictState.state === 'OK' && areResolvedPackages(conflictState.result)) {
    installer.updatePackageJson(conflictState.result, packageJsonPath);
  }

  // TODO: create branch + commit + pr
}

run(github.context);
