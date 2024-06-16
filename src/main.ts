#!/usr/bin/env node
import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Evaluator } from './lib';
import { Installer } from './lib/installer';
import { PackageRequirement, ResolvedPackage } from './lib/evaluator.interface';
import {PackageManager} from "nx/src/utils/package-manager";

const evaluator = new Evaluator();
const installer = new Installer();

function areResolvedPackages(array: ResolvedPackage[] | PackageRequirement[]): array is ResolvedPackage[] {
  return Array.isArray(array) && (!array.length || !!(array[0] as ResolvedPackage).semVerInfo);
}

async function run(args: ArgumentsCamelCase) {
  // TODO: fine grained error handling
  try {
    const conflictState = await evaluator.evaluate(args);
    console.debug(conflictState);
    if (conflictState.state === 'OK' && areResolvedPackages(conflictState.result)) {
      const path = args.path as string;
      let packageManager: PackageManager[];
      if (args.manager === 'yarn' || args.manager === 'pnpm' || args.manager === 'npm') {
        packageManager = [args.manager];
      }
      installer.install(conflictState.result, path, packageManager);
    } else {
      // TODO: conflict message & user action
    }
  } catch (e) {
    console.error(e);
  }
}

yargs(hideBin(process.argv))
  .command(['update', 'u'], 'resolve and update all peer dependencies by heuristics', {}, (args) => {
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
    description: 'Package manager to use for installing',
    choices: ['npm', 'pnpm', 'yarn'],
  })
  .command(['install', 'i'], 'resolve and update all peer dependencies by given versions', {}, (args) => {
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
    description: 'Package manager to use for installing',
    choices: ['npm', 'pnpm', 'yarn'],
  })
  .parse();
