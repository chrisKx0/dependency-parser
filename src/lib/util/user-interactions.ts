import * as core from '@actions/core';
import chalk from 'chalk';
import inquirer, { DistinctQuestion } from 'inquirer';
import { max, repeat } from 'lodash';
import { PackageManager } from 'nx/src/utils/package-manager';

import messages from '../data/messages.json';
import questions from '../data/questions.json';
import { PackageRequirement, ResolvedPackage } from './interfaces';

export enum Severity {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export async function promptQuestion<T extends PackageManager | number | boolean | string[]>(
  key: string,
  choices?: string[],
  defaults?: string[],
): Promise<T> {
  const question: DistinctQuestion = questions[key];
  console.assert(question, `Question with key ${key} doesn't exist!`);
  const answer = await inquirer.prompt([
    {
      name: 'value',
      ...question,
      choices: question.type === 'list' || question.type === 'checkbox' ? choices : null,
      default: question.type === 'checkbox' ? defaults : question.default,
    },
  ]);
  console.log();
  return answer.value;
}

export function createOpenRequirementOutput(openRequirements: PackageRequirement[], isInteractive = true) {
  const titleText = 'Resolution will be executed in order for the following dependencies:';
  isInteractive ? console.log(chalk.bold(titleText)) : core.info(titleText);
  for (let i = 0; i < openRequirements.length; i++) {
    const openRequirement = openRequirements[i];
    isInteractive
      ? console.log(`${chalk.green(i + 1 + ')')} ${chalk.cyan(openRequirement.name)}`)
      : core.info(`${i + 1}) ${openRequirement.name}`);
  }
  if (isInteractive) {
    console.log();
  }
}

export function createResolvedPackageOutput(resolvedPackages: ResolvedPackage[], isInteractive = true) {
  isInteractive ? createMessage('resolution_success', Severity.SUCCESS) : core.info(messages['resolution_success']);
  const maxLength = max(resolvedPackages.map((pr) => pr.name.length));
  for (const resolvedPackage of resolvedPackages) {
    isInteractive
      ? console.log(
          `${chalk.green('>>')} ${chalk.cyan(resolvedPackage.name)} ${repeat(' ', maxLength - resolvedPackage.name.length)}${chalk.gray(
            resolvedPackage.semVerInfo,
          )}`,
        )
      : core.info(`>> ${resolvedPackage.name} ${repeat(' ', maxLength - resolvedPackage.name.length)}${resolvedPackage.semVerInfo}`);
  }
  if (isInteractive) {
    console.log();
  }
}

export function createMessage(keyOrMessage: string, severity: Severity = Severity.INFO) {
  const message: string = messages[keyOrMessage] || keyOrMessage;
  let prefix = '';
  switch (severity) {
    case Severity.SUCCESS:
      prefix = chalk.bold.greenBright('Success ');
      break;
    case Severity.WARNING:
      prefix = chalk.bold.yellowBright('Warning ');
      break;
    case Severity.ERROR:
      prefix = chalk.bold.redBright('Failure ');
      break;
  }
  console.log(`${prefix}${message}\n`);
}
