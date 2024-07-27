import chalk from 'chalk';
import inquirer, { DistinctQuestion } from 'inquirer';
import messages from './data/messages.json';
import questions from './data/questions.json';
import { PackageRequirement, ResolvedPackage } from './evaluator.interface';
import { max, repeat } from 'lodash';
import { PackageManager } from 'nx/src/utils/package-manager';

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
      default: question.type === 'checkbox' ? defaults : null,
    },
  ]);
  console.log();
  return answer.value;
}

export function createOpenRequirementOutput(openRequirements: PackageRequirement[]) {
  console.log(chalk.bold('Resolution will be executed in order for the following dependencies:\n'));
  for (let i = 0; i < openRequirements.length; i++) {
    const openRequirement = openRequirements[i];
    console.log(`${chalk.green(i + 1 + ')')} ${chalk.cyan(openRequirement.name)}`);
  }
  console.log();
}

export function createResolvedPackageOutput(resolvedPackages: ResolvedPackage[]) {
  createMessage('resolution_success', Severity.SUCCESS);
  const maxLength = max(resolvedPackages.map((pr) => pr.name.length));
  for (const resolvedPackage of resolvedPackages) {
    console.log(
      `${chalk.green('>>')} ${chalk.cyan(resolvedPackage.name)} ${repeat(' ', maxLength - resolvedPackage.name.length)}${chalk.gray(
        resolvedPackage.semVerInfo,
      )}`,
    );
  }
  console.log();
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
