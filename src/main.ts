#!/usr/bin/env node
import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Evaluator } from './lib';
import { Installer } from './lib/installer';
import { ConflictState, PACKAGE_BUNDLES, PackageRequirement, ResolvedPackage, State } from './lib/evaluator.interface';
import { PackageManager } from 'nx/src/utils/package-manager';
import { createMessage, createOpenRequirementOutput, createResolvedPackageOutput, promptQuestion, Severity } from './lib/user-interactions';
import { Spinner } from 'clui';
import { uniq } from 'lodash';

function areResolvedPackages(array: ResolvedPackage[] | PackageRequirement[]): array is ResolvedPackage[] {
  return Array.isArray(array) && (!array.length || !!(array[0] as ResolvedPackage).semVerInfo);
}

async function run(args: ArgumentsCamelCase) {
  const evaluator = new Evaluator();

  // prompt questions
  const allowPreReleases = args['pre-release'] !== null ? !!args['pre-release'] : await promptQuestion<boolean>('allow_pre-releases');
  // TODO: use in resolution algorithm -> debugging needed anyways
  const allowedMajorVersions = (args['major-versions'] as number) || await promptQuestion<number>('major_version_count');
  const pinVersions = args['pin-versions'] !== null ? !!args['pin-versions'] : await promptQuestion<boolean>('pin_versions');

  // show spinner during preparation
  let spinner = new Spinner('Preparing dependency resolution...');
  spinner.start();

  let openRequirements = await evaluator.prepare(args, allowedMajorVersions, pinVersions);

  spinner.stop();

  // let user choose the packages he likes to include in package resolution
  if (!args['all']) {
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
    const path = (args.path as string) ?? process.cwd();

    const packageJsonPath = path + '/package.json';
    const nxPath = path + '/nx.json';

    // ask for package.json update as user input
    if (!args['modify-json'] && !(await promptQuestion<boolean>('modify_package_json'))) {
      return;
    }

    installer.updatePackageJson(conflictState.result, packageJsonPath);

    // ask for dependency installation as user input
    if (!args['install'] && !args['migrate'] && !(await promptQuestion<boolean>('install_dependencies'))) {
      return;
    }

    let packageManager: PackageManager;
    if (args['package-manager'] === 'yarn' || args['package-manager'] === 'pnpm' || args['package-manager'] === 'npm') {
      packageManager = args['package-manager'];
    } else {
    const packageManagers = installer.getPackageManagers(packageJsonPath, nxPath);
      if (!packageManagers.length) {
        createMessage('missing_package_manager', Severity.WARNING);
        return;
      }
      packageManager = await promptQuestion<PackageManager>('choose_package_manager', uniq(packageManagers));
    }

    const nxVersion = conflictState.result.find((rp) => rp.name.startsWith(PACKAGE_BUNDLES[0]))?.semVerInfo;
    const ngPackages = conflictState.result.filter((rp) => rp.name.startsWith(PACKAGE_BUNDLES[1]));

    const runMigrations = args['migrate'] != null ? !!args['migrate'] : await promptQuestion<boolean>('run_migrations');
    installer.install(packageManager, path, nxVersion, ngPackages, runMigrations);
  } else {
    createMessage('resolution_failure', Severity.ERROR);
    const retry = args['retry'] != null ? !!args['retry'] : await promptQuestion<boolean>('try_again');
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
  .option('all', {
    alias: 'a',
    type: 'boolean',
    boolean: true,
    description: 'Resolve all dependencies of package.json',
  })
  .option('install', {
    alias: 'i',
    type: 'boolean',
    boolean: true,
    description: 'Install the resolved dependencies',
  })
  .option('major-versions', {
    type: 'number',
    number: true,
    description: 'Number of major versions allowed to downgrade',
  })
  .option('migrate', {
    alias: 'm',
    type: 'boolean',
    boolean: true,
    description: 'Run migrations generated by migration tools',
  })
  .option('modify-json', {
    alias: 'j',
    type: 'boolean',
    boolean: true,
    description: 'Modify the package.json file after resolution',
  })
  .option('package-manager', {
    type: 'string',
    string: true,
    description: 'Package manager to use for installation',
    choices: ['npm', 'pnpm', 'yarn'],
  })
  .option('path', {
    type: 'string',
    string: true,
    description: 'Path of the package.json file',
  })
  .option('pin-versions', {
    alias: 'p',
    type: 'boolean',
    boolean: true,
    description: 'Pin the versions specified in package.json',
  })
  .option('pre-release', {
    alias: 'b', // beta
    type: 'boolean',
    boolean: true,
    description: 'Allow dependencies with pre-release versions (e.g. beta versions)',
  })
  .option('retry', {
    alias: 'r',
    type: 'boolean',
    boolean: true,
    description: 'Retry after failed attempts',
  })
  .parse();
