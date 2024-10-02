import * as core from '@actions/core';
import * as path from 'path';

import {
  areResolvedPackages,
  ConflictState,
  createOpenRequirementOutput,
  createResolvedPackageOutput,
  Evaluator,
  Installer,
  PACKAGE_BUNDLES,
  State,
} from './lib';

export async function run() {
  // get path of the package.json file inside the workspace
  const workspaceRoot = process.env.GITHUB_WORKSPACE || '';
  const packageJsonPath = path.normalize(path.join(workspaceRoot, core.getInput('package-json-path')));

  // initialize evaluator
  const allowedMajorVersions = parseInt(core.getInput('allowed-major-versions', { trimWhitespace: true })) || 2;
  const allowedMinorAndPatchVersions = parseInt(core.getInput('allowed-minor-versions', { trimWhitespace: true })) || 10;
  const allowPreReleases = core.getInput('allow-pre-releases', { trimWhitespace: true }) === 'true';
  const pinVersions = core.getInput('keep-versions', { trimWhitespace: true }) === 'true';
  const evaluator = new Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions);

  core.info('-- Preparing dependency resolution --');

  // run preparation
  const openRequirements = await evaluator.prepare({ path: packageJsonPath });
  createOpenRequirementOutput(openRequirements, false);

  core.info('-- Performing dependency resolution --');

  // run evaluation
  let conflictState: ConflictState;
  try {
    const result = await evaluator.evaluate(openRequirements);
    conflictState = result.conflictState;
  } catch (e) {
    conflictState = { state: State.CONFLICT };
  }

  if (conflictState.state === 'OK' && areResolvedPackages(conflictState.result)) {
    createResolvedPackageOutput(conflictState.result, false);
    const installer = new Installer();
    installer.updatePackageJson(conflictState.result, packageJsonPath + '/package.json');
    const nxVersion = conflictState.result.find((rp) => rp.name.startsWith(PACKAGE_BUNDLES[0]))?.semVerInfo;
    if (nxVersion) {
      core.info('Nx version: ' + nxVersion);
      core.setOutput('nx-version', nxVersion);
    }
  } else {
    core.error('Unable to evaluate dependencies with the provided parameters');
  }
}

run();
