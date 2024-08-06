#!/usr/bin/env node
import { Spinner } from 'clui';
import { uniq } from 'lodash';
import { PackageManager } from 'nx/src/utils/package-manager';
import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  ArgumentType,
  ConflictState,
  PACKAGE_BUNDLES,
  State,
  Evaluator,
  Installer,
  createMessage,
  createOpenRequirementOutput,
  createResolvedPackageOutput,
  promptQuestion,
  Severity,
  areResolvedPackages,
} from './lib';

async function run(args: ArgumentsCamelCase) {
  // initial user inputs
  const showPrompts = !args[ArgumentType.SKIP_PROMPTS];
  const allowedMajorVersions =
    (args[ArgumentType.MAJOR_VERSIONS] as number) ?? (!showPrompts ? 2 : await promptQuestion<number>('major_version_count'));
  const allowedMinorAndPatchVersions =
    (args[ArgumentType.MINOR_VERSIONS] as number) ?? (!showPrompts ? 10 : await promptQuestion<number>('minor_version_count'));
  const allowPreReleases =
    args[ArgumentType.PRE_RELEASE] != null
      ? !!args[ArgumentType.PRE_RELEASE]
      : showPrompts && (await promptQuestion<boolean>('allow_pre_releases'));
  const pinVersions =
    args[ArgumentType.PIN_VERSIONS] != null
      ? !!args[ArgumentType.PIN_VERSIONS]
      : showPrompts && (await promptQuestion<boolean>('pin_versions'));
  const forceRegeneration = !!args[ArgumentType.FORCE_REGENERATION];

  // initialize evaluator
  const evaluator = new Evaluator(allowedMajorVersions, allowedMinorAndPatchVersions, allowPreReleases, pinVersions, forceRegeneration);

  // show spinner during preparation
  let spinner = new Spinner('Preparing dependency resolution...');
  spinner.start();

  let openRequirements = await evaluator.prepare(args);

  spinner.stop();

  // let user choose the packages he likes to include in package resolution
  if (showPrompts && !args[ArgumentType.ALL_DEPENDENCIES]) {
    const names = openRequirements.map((pr) => pr.name);
    const requirementsToConsider = await promptQuestion<string[]>('choose_dependencies_to_resolve', names, names);
    openRequirements = openRequirements.filter((pr) => requirementsToConsider.includes(pr.name));
  } else {
    // show open requirements as user output
    createOpenRequirementOutput(openRequirements);
  }

  // show spinner during dependency resolution
  spinner = new Spinner('Performing dependency resolution...');
  spinner.start();

  let conflictState: ConflictState;
  try {
    conflictState = await evaluator.evaluate(openRequirements);
    spinner.stop();
  } catch (e) {
    conflictState = { state: State.CONFLICT };
    spinner.stop();
    createMessage(e.message, Severity.ERROR);
  }

  if (conflictState.state === 'OK' && areResolvedPackages(conflictState.result)) {
    createResolvedPackageOutput(conflictState.result);

    const installer = new Installer();
    const path = (args[ArgumentType.PATH] as string) ?? process.cwd();
    const packageJsonPath = path + '/package.json';
    const nxPath = path + '/nx.json';

    // ask for package.json update as user input
    if (
      !(args[ArgumentType.MODIFY_JSON] != null
        ? !!args[ArgumentType.MODIFY_JSON]
        : !showPrompts || (await promptQuestion<boolean>('modify_package_json')))
    ) {
      return;
    }

    installer.updatePackageJson(conflictState.result, packageJsonPath);

    // ask for dependency installation as user input
    if (
      !(args[ArgumentType.INSTALL] != null
        ? !!args[ArgumentType.INSTALL]
        : !showPrompts || (await promptQuestion<boolean>('install_dependencies')))
    ) {
      return;
    }

    let packageManager: PackageManager;
    if (
      args[ArgumentType.PACKAGE_MANAGER] === 'yarn' ||
      args[ArgumentType.PACKAGE_MANAGER] === 'pnpm' ||
      args[ArgumentType.PACKAGE_MANAGER] === 'npm'
    ) {
      packageManager = args[ArgumentType.PACKAGE_MANAGER];
    } else {
      const packageManagers = installer.getPackageManagers(packageJsonPath, nxPath);
      if (!packageManagers.length) {
        createMessage('missing_package_manager', Severity.WARNING);
        return;
      }
      packageManager = showPrompts
        ? await promptQuestion<PackageManager>('choose_package_manager', uniq(packageManagers))
        : packageManagers[0];
    }

    const nxVersion = conflictState.result.find((rp) => rp.name.startsWith(PACKAGE_BUNDLES[0]))?.semVerInfo;
    const ngPackages = conflictState.result.filter((rp) => rp.name.startsWith(PACKAGE_BUNDLES[1]));
    const runMigrations =
      args[ArgumentType.MIGRATE] != null ? !!args[ArgumentType.MIGRATE] : showPrompts && (await promptQuestion<boolean>('run_migrations'));

    // show spinner during installation
    spinner = new Spinner(`Performing installation with ${packageManager}...`);
    spinner.start();

    await installer.install(packageManager, path, nxVersion, ngPackages, runMigrations);

    spinner.stop();
  } else {
    createMessage('resolution_failure', Severity.ERROR);
    const retry =
      args[ArgumentType.RETRY] != null ? !!args[ArgumentType.RETRY] : showPrompts && (await promptQuestion<boolean>('try_again'));
    if (retry) {
      run(args);
    }
  }
}

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
  .option(ArgumentType.FORCE_REGENERATION, {
    alias: 'f',
    type: 'boolean',
    boolean: true,
    description: 'Force cache regeneration',
  })
  .option(ArgumentType.INSTALL, {
    alias: 'i',
    type: 'boolean',
    boolean: true,
    description: 'Install the resolved dependencies',
  })
  .option(ArgumentType.MAJOR_VERSIONS, {
    type: 'number',
    number: true,
    description: 'Number of major versions allowed to downgrade',
  })
  .option(ArgumentType.MINOR_VERSIONS, {
    type: 'number',
    number: true,
    description: 'Number of minor and patch versions allowed per major version',
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
    description: 'Package manager to use for installation',
    choices: ['npm', 'pnpm', 'yarn'],
  })
  .option(ArgumentType.PATH, {
    type: 'string',
    string: true,
    description: 'Path of the package.json file',
  })
  .option(ArgumentType.PIN_VERSIONS, {
    alias: 'v',
    type: 'boolean',
    boolean: true,
    description: 'Pin the versions specified in package.json',
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
    description: 'Disable all user prompts',
  })
  .parse();
