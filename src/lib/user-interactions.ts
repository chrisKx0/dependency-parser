import chalk from 'chalk';
import inquirer, { DistinctQuestion } from 'inquirer';
import questions from './data/questions.json';
import { PackageRequirement, ResolvedPackage } from './evaluator.interface';
import { max, repeat } from 'lodash';
import {PackageManager} from "nx/src/utils/package-manager";

export async function promptQuestion<T extends PackageManager | number | boolean>(key: string, choices?: string[]): Promise<T> {
  const question: DistinctQuestion = questions[key];
  if (!question) {
    return Promise.reject(new Error(`Question with key ${key} doesn't exist!`));
  }
  const answer = await inquirer.prompt([{ name: 'value', ...question, choices: question.type === 'list' ? choices : null }]);
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
  console.log(`${chalk.bold.greenBright('Success')} Dependencies resolved to the following versions:\n`);
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

export function createConflictOutput() {
  console.log(`${chalk.bold.redBright('Failure')} Dependencies couldn't be resolved with the current properties...\n`);
}

export function warn(text: string) {
  console.log(chalk.yellow(text));
}
