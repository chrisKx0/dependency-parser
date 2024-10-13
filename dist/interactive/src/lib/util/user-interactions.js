"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessage = exports.createResolvedPackageOutput = exports.createOpenRequirementOutput = exports.promptQuestion = void 0;
const tslib_1 = require("tslib");
const core = tslib_1.__importStar(require("@actions/core"));
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const inquirer_1 = tslib_1.__importDefault(require("inquirer"));
const lodash_1 = require("lodash");
const messages_json_1 = tslib_1.__importDefault(require("../data/messages.json"));
const questions_json_1 = tslib_1.__importDefault(require("../data/questions.json"));
const interfaces_1 = require("./interfaces");
/**
 * prompts a question on command line and awaits user action
 * @param key key of the question to show
 * @param choices possible (dynamic) choices the user can choose from (optional)
 * @param defaults default values of the provided choices (optional)
 */
function promptQuestion(key, choices, defaults) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        // retrieve question from questions object with message, type and default (if no dynamic choices are provided)
        const question = questions_json_1.default[key];
        console.assert(question, `Question with key ${key} doesn't exist!`);
        // make an inquirer prompt on command line with provided question parameters
        const answer = yield inquirer_1.default.prompt([
            Object.assign(Object.assign({ name: 'value' }, question), { choices: question.type === 'list' || question.type === 'checkbox' ? choices : null, default: question.type === 'checkbox' ? defaults : question.default }),
        ]);
        // add blank line on command line
        console.log();
        return answer.value;
    });
}
exports.promptQuestion = promptQuestion;
/**
 * creates a formatted console output before evaluation with the open requirements
 * @param openRequirements open requirements that are taken into account in evaluation
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
function createOpenRequirementOutput(openRequirements, isInteractive = true) {
    const titleText = 'Resolution will be executed in order for the following dependencies:';
    // create CLI console output formatted and styled with chalk
    // or GitHub core info output
    isInteractive ? console.log(chalk_1.default.bold(titleText)) : core.info(titleText);
    // open requirements are enumerated in order in the output
    for (let i = 0; i < openRequirements.length; i++) {
        const openRequirement = openRequirements[i];
        isInteractive
            ? console.log(`${chalk_1.default.green(i + 1 + ')')} ${chalk_1.default.cyan(openRequirement.name)}`)
            : core.info(`${i + 1}) ${openRequirement.name}`);
    }
    if (isInteractive) {
        // add blank line on command line
        console.log();
    }
}
exports.createOpenRequirementOutput = createOpenRequirementOutput;
/**
 * creates a formatted console output with the resolved packages and their versions after evaluation
 * @param resolvedPackages resolved packages that should be shown
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
function createResolvedPackageOutput(resolvedPackages, isInteractive = true) {
    isInteractive ? createMessage('resolution_success', interfaces_1.Severity.SUCCESS) : core.info(messages_json_1.default['resolution_success']);
    const maxLength = (0, lodash_1.max)(resolvedPackages.map((pr) => pr.name.length));
    // show package name and versions in formatted columns and styled with chalk in case of CLI console output
    for (const resolvedPackage of resolvedPackages) {
        isInteractive
            ? console.log(`${chalk_1.default.green('>>')} ${chalk_1.default.cyan(resolvedPackage.name)} ${(0, lodash_1.repeat)(' ', maxLength - resolvedPackage.name.length)}${chalk_1.default.gray(resolvedPackage.semVerInfo)}`)
            : core.info(`>> ${resolvedPackage.name} ${(0, lodash_1.repeat)(' ', maxLength - resolvedPackage.name.length)}${resolvedPackage.semVerInfo}`);
    }
    if (isInteractive) {
        // add blank line on command line
        console.log();
    }
}
exports.createResolvedPackageOutput = createResolvedPackageOutput;
/**
 * creates a message on the command line with a severity
 * @param keyOrMessage key of the message to show or the message itself (for dynamic messages)
 * @param severity message severity (info, success, warning or error)
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
function createMessage(keyOrMessage, severity = interfaces_1.Severity.INFO) {
    const message = messages_json_1.default[keyOrMessage] || keyOrMessage;
    let prefix = '';
    switch (severity) {
        case interfaces_1.Severity.SUCCESS:
            prefix = chalk_1.default.bold.greenBright('Success ');
            break;
        case interfaces_1.Severity.WARNING:
            prefix = chalk_1.default.bold.yellowBright('Warning ');
            break;
        case interfaces_1.Severity.ERROR:
            prefix = chalk_1.default.bold.redBright('Failure ');
            break;
    }
    console.log(`${prefix}${message}\n`);
}
exports.createMessage = createMessage;
//# sourceMappingURL=user-interactions.js.map