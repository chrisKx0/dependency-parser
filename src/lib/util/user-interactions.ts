import * as core from '@actions/core';
import chalk from 'chalk';
import inquirer, { DistinctQuestion } from 'inquirer';
import { max, repeat } from 'lodash';
import { PackageManager } from 'nx/src/utils/package-manager';

import messages from '../data/messages.json';
import questions from '../data/questions.json';
import { PackageRequirement, ResolvedPackage, Severity } from './interfaces';

/**
 * prompts a question on command line and awaits user action
 * @param key key of the question to show
 * @param choices possible (dynamic) choices the user can choose from (optional)
 * @param defaults default values of the provided choices (optional)
 */
export async function promptQuestion<T extends PackageManager | number | boolean | string[]>(
  key: string,
  choices?: string[],
  defaults?: string[],
): Promise<T> {
  // retrieve question from questions object with message, type and default (if no dynamic choices are provided)
  const question: DistinctQuestion = questions[key];
  console.assert(question, `Question with key ${key} doesn't exist!`);
  // make an inquirer prompt on command line with provided question parameters
  const answer = await inquirer.prompt([
    {
      name: 'value',
      ...question,
      choices: question.type === 'list' || question.type === 'checkbox' ? choices : null,
      default: question.type === 'checkbox' ? defaults : question.default,
    },
  ]);
  // add blank line on command line
  console.log();
  return answer.value;
}

/**
 * creates a formatted console output before evaluation with the open requirements
 * @param openRequirements open requirements that are taken into account in evaluation
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
export function createOpenRequirementOutput(openRequirements: PackageRequirement[], isInteractive = true) {
  const titleText = 'Resolution will be executed in order for the following dependencies:';
  // create CLI console output formatted and styled with chalk
  // or GitHub core info output
  isInteractive ? console.log(chalk.bold(titleText)) : core.info(titleText);
  // open requirements are enumerated in order in the output
  for (let i = 0; i < openRequirements.length; i++) {
    const openRequirement = openRequirements[i];
    isInteractive
      ? console.log(`${chalk.green(i + 1 + ')')} ${chalk.cyan(openRequirement.name)}`)
      : core.info(`${i + 1}) ${openRequirement.name}`);
  }
  if (isInteractive) {
    // add blank line on command line
    console.log();
  }
}

/**
 * creates a formatted console output with the resolved packages and their versions after evaluation
 * @param resolvedPackages resolved packages that should be shown
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
export function createResolvedPackageOutput(resolvedPackages: ResolvedPackage[], isInteractive = true) {
  isInteractive ? createMessage('resolution_success', Severity.SUCCESS) : core.info(messages['resolution_success']);
  const maxLength = max(resolvedPackages.map((pr) => pr.name.length));
  // show package name and versions in formatted columns and styled with chalk in case of CLI console output
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
    // add blank line on command line
    console.log();
  }
}

/**
 * creates a message on the command line with a severity
 * @param keyOrMessage key of the message to show or the message itself (for dynamic messages)
 * @param severity message severity (info, success, warning or error)
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
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
