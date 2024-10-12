import * as core from '@actions/core';
import * as path from 'path';

import {
  areResolvedPackages,
  ConflictState,
  createOpenRequirementOutput,
  createResolvedPackageOutput,
  Evaluator,
  getPackageRegex,
  Installer,
  PACKAGE_BUNDLES,
  State,
} from './lib';

export async function run() {
  // get path of the package.json file inside the workspace
  const workspaceRoot = process.env.GITHUB_WORKSPACE || '';
  const packageJsonPath = path.normalize(path.join(workspaceRoot, core.getInput('package-json-path')));

  // get GitHub action inputs
  const allowedMajorVersions = parseInt(core.getInput('allowed-major-versions', { trimWhitespace: true })) || 2;
  const allowedMinorAndPatchVersions = parseInt(core.getInput('allowed-minor-versions', { trimWhitespace: true })) || 10;
  const allowPreReleases = core.getInput('allow-pre-releases', { trimWhitespace: true }) !== 'false';
  const force = core.getInput('force', { trimWhitespace: true }) !== 'false';
  const pinVersions = core.getInput('keep-versions', { trimWhitespace: true }) === 'true';

  // initialize excluded and included packages
  const excludedPackages = (core.getInput('exclude').split(' ') || []).map(getPackageRegex).filter((ep) => ep);
  const includedPackages = (core.getInput('include').split(' ') || []).map(getPackageRegex).filter((ep) => ep);

  // initialize evaluator
  const evaluator = new Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions, force);

  core.info('-- Preparing dependency resolution --');

  // perform preparation to get initial open requirements
  const openRequirements = await evaluator.prepare({ path: packageJsonPath }, excludedPackages, includedPackages);
  createOpenRequirementOutput(openRequirements, false);

  core.info('-- Performing dependency resolution --');

  // run evaluation
  let conflictState: ConflictState = { state: State.CONFLICT };
  try {
    // perform evaluation to get resolved packages
    const result = await evaluator.evaluate(openRequirements);
    conflictState = result.conflictState;
  } catch (e) {
    core.info(e.message);
  }

  // in case of no conflict, create action output and update package.json
  if (conflictState.state === 'OK' && areResolvedPackages(conflictState.result)) {
    createResolvedPackageOutput(conflictState.result, false);
    const installer = new Installer();
    installer.updatePackageJson(conflictState.result, packageJsonPath + '/package.json');
    // create nx-version action output for later steps if Nx got updated
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
