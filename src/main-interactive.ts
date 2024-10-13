#!/usr/bin/env node
import { Spinner } from 'clui';
import { uniq } from 'lodash';
import { PackageManager } from 'nx/src/utils/package-manager';
import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  ArgumentType,
  State,
  Evaluator,
  Installer,
  createMessage,
  createOpenRequirementOutput,
  createResolvedPackageOutput,
  promptQuestion,
  Severity,
  areResolvedPackages,
  getPackageRegex,
  EvaluationResult,
  ConflictState,
} from './lib';

async function run(args: ArgumentsCamelCase) {
  // get command line arguments and initial user inputs
  const collectMetrics = !!args[ArgumentType.COLLECT_METRICS];
  const force = !!args[ArgumentType.FORCE];
  const showPrompts = !args[ArgumentType.SKIP_PROMPTS];
  const allowedMajorVersions =
    (args[ArgumentType.MAJOR_VERSIONS] as number) ?? (!showPrompts ? 2 : await promptQuestion<number>('major_version_count'));
  const allowedMinorAndPatchVersions =
    (args[ArgumentType.MINOR_VERSIONS] as number) ?? (!showPrompts ? 10 : await promptQuestion<number>('minor_version_count'));
  const allowPreReleases =
    args[ArgumentType.PRE_RELEASE] != null
      ? !!args[ArgumentType.PRE_RELEASE]
      : !showPrompts || (await promptQuestion<boolean>('allow_pre_releases'));
  const pinVersions =
    args[ArgumentType.KEEP_VERSIONS] != null
      ? !!args[ArgumentType.KEEP_VERSIONS]
      : showPrompts && (await promptQuestion<boolean>('keep_versions'));

  // initialize excluded and included packages
  const excludedPackages = ((args[ArgumentType.EXCLUDE] as string[]) || []).map(getPackageRegex).filter((ep) => ep);
  const includedPackages = ((args[ArgumentType.INCLUDE] as string[]) || []).map(getPackageRegex).filter((ep) => ep);

  // initialize evaluator
  const evaluator = new Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions, force);

  let startTime: number;
  let endTime: number;

  // show spinner during preparation
  let spinner = new Spinner('Preparing dependency resolution...');
  spinner.start();
  startTime = performance.now();

  // perform preparation to get initial open requirements
  let openRequirements = await evaluator.prepare(args, excludedPackages, includedPackages);

  endTime = performance.now();
  // calculate duration of preparation with start and end times
  const durationPreparation = (endTime - startTime) / 1000;
  spinner.stop();

  // user choice of the packages to be included in package resolution
  if (showPrompts && !args[ArgumentType.ALL_DEPENDENCIES]) {
    const names = openRequirements.map((pr) => pr.name);
    const requirementsToConsider = await promptQuestion<string[]>('choose_dependencies_to_resolve', names, names);
    openRequirements = openRequirements.filter((pr) => requirementsToConsider.includes(pr.name));
  } else {
    // create command line output of open requirements
    createOpenRequirementOutput(openRequirements);
  }

  // show spinner during dependency resolution
  spinner = new Spinner('Performing dependency resolution...');
  spinner.start();
  startTime = performance.now();

  let result: EvaluationResult;
  let conflictState: ConflictState = { state: State.CONFLICT };
  try {
    // perform evaluation to get resolved packages
    result = await evaluator.evaluate(openRequirements);
    conflictState = result.conflictState;
    spinner.stop();
  } catch (e) {
    spinner.stop();
    createMessage(e.message, Severity.ERROR);
  }

  endTime = performance.now();
  // calculate duration of evaluation with start and end times
  const durationEvaluation = (endTime - startTime) / 1000;

  // perform post install steps if no conflict has arisen
  if (conflictState.state === 'OK' && areResolvedPackages(conflictState.result)) {
    createResolvedPackageOutput(conflictState.result);

    const installer = new Installer();

    // get paths of package.json and nx.json
    const path = (args[ArgumentType.PATH] as string) ?? process.cwd();
    const packageJsonPath = path + '/package.json';
    const nxPath = path + '/nx.json';

    if (collectMetrics) {
      // create metrics file when flag was set
      installer.createMetricsFile({ ...result.metrics, durationPreparation, durationEvaluation }, packageJsonPath);
    }

    // user choice if package.json should be updated
    if (
      !(args[ArgumentType.MODIFY_JSON] != null
        ? !!args[ArgumentType.MODIFY_JSON]
        : !showPrompts || (await promptQuestion<boolean>('modify_package_json')))
    ) {
      return;
    }

    installer.updatePackageJson(conflictState.result, packageJsonPath);

    // user choice if dependencies should be installed
    if (
      !(args[ArgumentType.INSTALL] != null
        ? !!args[ArgumentType.INSTALL]
        : !showPrompts || (await promptQuestion<boolean>('install_dependencies')))
    ) {
      return;
    }

    // get package manager choice either by command line option or other means
    let packageManager: PackageManager;
    if (
      args[ArgumentType.PACKAGE_MANAGER] === 'yarn' ||
      args[ArgumentType.PACKAGE_MANAGER] === 'pnpm' ||
      args[ArgumentType.PACKAGE_MANAGER] === 'npm'
    ) {
      packageManager = args[ArgumentType.PACKAGE_MANAGER];
    } else {
      // get all possible package managers and let the user choose one (or show warning)
      const packageManagers = installer.getPackageManagers(packageJsonPath, nxPath);
      if (!packageManagers.length) {
        createMessage('missing_package_manager', Severity.WARNING);
        return;
      }
      packageManager = showPrompts
        ? await promptQuestion<PackageManager>('choose_package_manager', uniq(packageManagers))
        : packageManagers[0];
    }

    // get nx and Angular versions (if their packages will be installed) and ask user if migrations should be made
    const nxVersion = conflictState.result.find((rp) => rp.name.startsWith('@nx'))?.semVerInfo;
    const ngPackages = conflictState.result.filter((rp) => rp.name.startsWith('@angular'));
    const runMigrations =
      args[ArgumentType.MIGRATE] != null ? !!args[ArgumentType.MIGRATE] : showPrompts && (await promptQuestion<boolean>('run_migrations'));

    // show spinner during installation
    spinner = new Spinner(`Performing installation with ${packageManager}...`);
    spinner.start();

    // perform installation with all retrieved parameters
    await installer.install(packageManager, path, nxVersion, ngPackages, runMigrations);

    spinner.stop();
  } else {
    // if conflict did arise, show error message and ask the user if it should be retried (with different parameters)
    createMessage('resolution_failure', Severity.ERROR);
    const retry =
      args[ArgumentType.RETRY] != null ? !!args[ArgumentType.RETRY] : showPrompts && (await promptQuestion<boolean>('try_again'));
    if (retry) {
      run(args);
    }
  }
}

// initialize CLI with commands and options via yargs
yargs(hideBin(process.argv))
  .command(['update', 'u'], 'Updates all peer dependencies by heuristics', {}, (args) => {
    run(args);
  })
  .command(['install', 'i'], 'Updates all peer dependencies by given versions', {}, (args) => {
    run(args);
  })
  .option(ArgumentType.ALL_DEPENDENCIES, {
    alias: 'a',
    type: 'boolean',
    boolean: true,
    description: 'Resolve all dependencies of package.json',
  })
  .option(ArgumentType.COLLECT_METRICS, {
    alias: 'c',
    type: 'boolean',
    boolean: true,
    description: 'Collect performance metrics and save to file',
  })
  .option(ArgumentType.EXCLUDE, {
    type: 'array',
    array: true,
    description: 'Packages to exclude from evaluation',
  })
  .option(ArgumentType.FORCE, {
    alias: 'f',
    type: 'boolean',
    boolean: true,
    description: 'Forcibly try every version combination',
  })
  .option(ArgumentType.INCLUDE, {
    type: 'array',
    array: true,
    description: 'Packages to take into account in evaluation',
  })
  .option(ArgumentType.INSTALL, {
    alias: 'i',
    type: 'boolean',
    boolean: true,
    description: 'Install the resolved dependencies with package manager',
  })
  .option(ArgumentType.MAJOR_VERSIONS, {
    type: 'number',
    number: true,
    description: 'Number of major versions allowed to downgrade',
  })
  .option(ArgumentType.MINOR_VERSIONS, {
    type: 'number',
    number: true,
    description: 'Number of minor versions allowed per major version',
  })
  .option(ArgumentType.MIGRATE, {
    alias: 'm',
    type: 'boolean',
    boolean: true,
    description: 'Run migrations generated by migration tools',
  })
  .option(ArgumentType.MODIFY_JSON, {
    alias: 'j',
    type: 'boolean',
    boolean: true,
    description: 'Modify the package.json file after resolution',
  })
  .option(ArgumentType.PACKAGE_MANAGER, {
    type: 'string',
    string: true,
    description: 'The package manager used for installation',
    choices: ['npm', 'pnpm', 'yarn'],
  })
  .option(ArgumentType.PATH, {
    type: 'string',
    string: true,
    description: 'Path of the package.json file',
  })
  .option(ArgumentType.KEEP_VERSIONS, {
    alias: 'k',
    type: 'boolean',
    boolean: true,
    description: 'Keep the versions specified in package.json',
  })
  .option(ArgumentType.PRE_RELEASE, {
    alias: 'p',
    type: 'boolean',
    boolean: true,
    description: 'Allow dependencies with pre-release versions (e.g. beta versions)',
  })
  .option(ArgumentType.RETRY, {
    alias: 'r',
    type: 'boolean',
    boolean: true,
    description: 'Retry after failed attempts',
  })
  .option(ArgumentType.SKIP_PROMPTS, {
    alias: 's',
    type: 'boolean',
    boolean: true,
    description: 'Skip all user prompts',
  })
  .parse();
