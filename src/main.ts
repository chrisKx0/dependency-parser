#!/usr/bin/env node
import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Evaluator } from './lib';
import { Installer } from './lib/installer';
import { ConflictState, PACKAGE_BUNDLES, PackageRequirement, ResolvedPackage, State } from './lib/evaluator.interface';
import { PackageManager } from 'nx/src/utils/package-manager';
import { createMessage, createOpenRequirementOutput, createResolvedPackageOutput, promptQuestion, Severity } from './lib/user-interactions';
import { Spinner } from 'clui';
import {uniq} from "lodash";

function areResolvedPackages(array: ResolvedPackage[] | PackageRequirement[]): array is ResolvedPackage[] {
  return Array.isArray(array) && (!array.length || !!(array[0] as ResolvedPackage).semVerInfo);
}

async function run(args: ArgumentsCamelCase) {
  const evaluator = new Evaluator();

  // prompt questions
  const allowedMajorVersions = await promptQuestion<number>('major_version_count');
  const pinVersions = await promptQuestion<boolean>('pin_versions');

  // show spinner during preparation
  let spinner = new Spinner('Preparing dependency resolution...');
  spinner.start();

  const openRequirements = await evaluator.prepare(args, allowedMajorVersions, pinVersions);

  spinner.stop();

  // show open requirements as user output
  createOpenRequirementOutput(openRequirements);

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
    let packageManager: PackageManager;
    if (args.manager === 'yarn' || args.manager === 'pnpm' || args.manager === 'npm') {
      packageManager = args.manager;
    }

    const packageJsonPath = path + '/package.json';
    const nxPath = path + '/nx.json';

    // ask for package.json update as user input
    if (!(await promptQuestion<boolean>('modify_package_json'))) {
      return;
    }

    installer.updatePackageJson(conflictState.result, packageJsonPath);

    // ask for dependency installation as user input
    if (!(await promptQuestion<boolean>('install_dependencies'))) {
      return;
    }

    if (!packageManager) {
      const packageManagers = installer.getPackageManagers(packageJsonPath, nxPath);
      if (!packageManagers.length) {
        createMessage('missing_package_manager', Severity.WARNING);
        return;
      }
      packageManager = await promptQuestion<PackageManager>('choose_package_manager', uniq(packageManagers));
    }

    const nxVersion = conflictState.result.find((rp) => rp.name.startsWith(PACKAGE_BUNDLES[0]))?.semVerInfo;
    const ngPackages = conflictState.result.filter((rp) => rp.name.startsWith(PACKAGE_BUNDLES[1]));

    const runMigrations = await promptQuestion<boolean>('run_migrations');
    installer.install(packageManager, path, nxVersion, ngPackages, runMigrations);
  } else {
    createMessage('resolution_failure', Severity.ERROR);
    if (await promptQuestion<boolean>('try_again')) {
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
  .option('path', {
    alias: 'p',
    type: 'string',
    description: 'Path of the package.json file',
  })
  .option('manager', {
    alias: 'm',
    type: 'string',
    description: 'Package manager to use for installation',
    choices: ['npm', 'pnpm', 'yarn'],
  })
  .parse();
