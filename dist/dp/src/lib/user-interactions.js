"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessage = exports.createResolvedPackageOutput = exports.createOpenRequirementOutput = exports.promptQuestion = exports.Severity = void 0;
const chalk_1 = __importDefault(require("chalk"));
const inquirer_1 = __importDefault(require("inquirer"));
const messages_json_1 = __importDefault(require("./data/messages.json"));
const questions_json_1 = __importDefault(require("./data/questions.json"));
const lodash_1 = require("lodash");
var Severity;
(function (Severity) {
    Severity["INFO"] = "info";
    Severity["SUCCESS"] = "success";
    Severity["WARNING"] = "warning";
    Severity["ERROR"] = "error";
})(Severity || (exports.Severity = Severity = {}));
function promptQuestion(key, choices, defaults) {
    return __awaiter(this, void 0, void 0, function* () {
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
function createOpenRequirementOutput(openRequirements) {
    console.log(chalk_1.default.bold('Resolution will be executed in order for the following dependencies:\n'));
    for (let i = 0; i < openRequirements.length; i++) {
        const openRequirement = openRequirements[i];
        console.log(`${chalk_1.default.green(i + 1 + ')')} ${chalk_1.default.cyan(openRequirement.name)}`);
    }
    console.log();
}
exports.createOpenRequirementOutput = createOpenRequirementOutput;
function createResolvedPackageOutput(resolvedPackages) {
    createMessage('resolution_success', Severity.SUCCESS);
    const maxLength = (0, lodash_1.max)(resolvedPackages.map((pr) => pr.name.length));
    for (const resolvedPackage of resolvedPackages) {
        console.log(`${chalk_1.default.green('>>')} ${chalk_1.default.cyan(resolvedPackage.name)} ${(0, lodash_1.repeat)(' ', maxLength - resolvedPackage.name.length)}${chalk_1.default.gray(resolvedPackage.semVerInfo)}`);
    }
    console.log();
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