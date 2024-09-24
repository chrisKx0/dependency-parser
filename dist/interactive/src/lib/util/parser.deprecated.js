"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMarkdown = exports.parseConsoleOutput = void 0;
const compare_versions_1 = require("compare-versions");
const marked_1 = require("marked");
// matches versions with the special characters ^, *, <, <=, >, >=, = and ranges between two versions connected by -
const VALIDATE_VERSION_REGEX = /((\^|\*|<|<=|>|>=|=)?\d+\.?\d*\.?\d*)(\s*-\s*((\^|\*|<|<=|>|>=|=)?\d+\.?\d*\.?\d*)|$)/;
/**
 * Parse UCS2 encoded console output file.
 * Can be created by running Powershell Out-Dir command with "npm/pnpm install".
 * @param output Content of the output file.
 * @deprecated
 */
function parseConsoleOutput(output) {
    const dependencyInfos = [];
    [...output.matchAll(/^((?!missing peer).)+(\r\n|\n)(?=.*missing peer.*)/gm)]
        .map((match) => match[0].trim().replace('\r', '').replace('\n', ''))
        .forEach((match) => {
        const splits = match.split(' ');
        dependencyInfos.push({ version: splits.pop(), name: splits.pop() });
    });
    return dependencyInfos;
}
exports.parseConsoleOutput = parseConsoleOutput;
/**
 * Parses a markdown file for dependency matrices and returns a list of dependency entries.
 * @param markdown The string of the markdown file.
 * @param packageName Name of the package to find dependencies for.
 * @deprecated
 */
function parseMarkdown(markdown, packageName) {
    var _a, _b;
    const tokens = marked_1.marked.lexer(markdown);
    const packageNameShortened = packageName.split('/').pop();
    let foundDependencyToken = false;
    let tableToken;
    for (const token of tokens) {
        if (token.type === 'heading' && ['dependencies', 'versions'].includes(token.text.toLowerCase())) {
            foundDependencyToken = true;
            continue;
        }
        if (foundDependencyToken && token.type === 'table') {
            tableToken = token;
            break;
        }
    }
    const dependencyEntries = [];
    const headers = (_a = tableToken.header) === null || _a === void 0 ? void 0 : _a.map((h) => h.text);
    const packageRowIndex = (_b = tableToken.header) === null || _b === void 0 ? void 0 : _b.findIndex((h) => h.text === packageName || h.text === packageNameShortened);
    if (packageRowIndex === -1) {
        return dependencyEntries;
    }
    for (const row of tableToken.rows) {
        const entryValue = {};
        for (let i = 0; i < headers.length; i++) {
            if (i !== packageRowIndex && ((0, compare_versions_1.validate)(row[i].text) || VALIDATE_VERSION_REGEX.test(row[i].text.trim()))) {
                entryValue[headers[i]] = row[i].text;
            }
        }
        dependencyEntries.push({
            versions: row[packageRowIndex].text.split(',').map((v) => v.trim()),
            dependencies: entryValue,
        });
    }
    return dependencyEntries;
}
exports.parseMarkdown = parseMarkdown;
//# sourceMappingURL=parser.deprecated.js.map