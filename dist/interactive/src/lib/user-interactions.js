"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessage = exports.createResolvedPackageOutput = exports.createOpenRequirementOutput = exports.promptQuestion = exports.Severity = void 0;
const tslib_1 = require("tslib");
const core = tslib_1.__importStar(require("@actions/core"));
const chalk_1 = tslib_1.__importDefault(require("chalk"));
const inquirer_1 = tslib_1.__importDefault(require("inquirer"));
const messages_json_1 = tslib_1.__importDefault(require("./data/messages.json"));
const questions_json_1 = tslib_1.__importDefault(require("./data/questions.json"));
const lodash_1 = require("lodash");
var Severity;
(function (Severity) {
    Severity["INFO"] = "info";
    Severity["SUCCESS"] = "success";
    Severity["WARNING"] = "warning";
    Severity["ERROR"] = "error";
})(Severity || (exports.Severity = Severity = {}));
function promptQuestion(key, choices, defaults) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const question = questions_json_1.default[key];
        console.assert(question, `Question with key ${key} doesn't exist!`);
        const answer = yield inquirer_1.default.prompt([
            Object.assign(Object.assign({ name: 'value' }, question), { choices: question.type === 'list' || question.type === 'checkbox' ? choices : null, default: question.type === 'checkbox' ? defaults : question.default }),
        ]);
        console.log();
        return answer.value;
    });
}
exports.promptQuestion = promptQuestion;
function createOpenRequirementOutput(openRequirements, isInteractive = true) {
    const titleText = 'Resolution will be executed in order for the following dependencies:\n';
    isInteractive ? console.log(chalk_1.default.bold(titleText)) : core.info(titleText);
    for (let i = 0; i < openRequirements.length; i++) {
        const openRequirement = openRequirements[i];
        isInteractive ? console.log(`${chalk_1.default.green(i + 1 + ')')} ${chalk_1.default.cyan(openRequirement.name)}`) : core.info(`${i + 1}) ${openRequirement.name}`);
    }
    isInteractive ? console.log() : core.info('');
}
exports.createOpenRequirementOutput = createOpenRequirementOutput;
function createResolvedPackageOutput(resolvedPackages, isInteractive = true) {
    isInteractive ? createMessage('resolution_success', Severity.SUCCESS) : core.info(messages_json_1.default['resolution_success']);
    const maxLength = (0, lodash_1.max)(resolvedPackages.map((pr) => pr.name.length));
    for (const resolvedPackage of resolvedPackages) {
        isInteractive ? console.log(`${chalk_1.default.green('>>')} ${chalk_1.default.cyan(resolvedPackage.name)} ${(0, lodash_1.repeat)(' ', maxLength - resolvedPackage.name.length)}${chalk_1.default.gray(resolvedPackage.semVerInfo)}`) : core.info(`>> ${resolvedPackage.name} ${(0, lodash_1.repeat)(' ', maxLength - resolvedPackage.name.length)}${resolvedPackage.semVerInfo}`);
    }
    isInteractive ? console.log() : core.info('');
}
exports.createResolvedPackageOutput = createResolvedPackageOutput;
function createMessage(keyOrMessage, severity = Severity.INFO) {
    const message = messages_json_1.default[keyOrMessage] || keyOrMessage;
    let prefix = '';
    switch (severity) {
        case Severity.SUCCESS:
            prefix = chalk_1.default.bold.greenBright('Success ');
            break;
        case Severity.WARNING:
            prefix = chalk_1.default.bold.yellowBright('Warning ');
            break;
        case Severity.ERROR:
            prefix = chalk_1.default.bold.redBright('Failure ');
            break;
    }
    console.log(`${prefix}${message}\n`);
}
exports.createMessage = createMessage;
//# sourceMappingURL=user-interactions.js.map