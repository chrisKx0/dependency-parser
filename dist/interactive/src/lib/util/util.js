"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPackageRegex = void 0;
/**
 * creates a regex that matches one or many packages
 * @param packageNameOrPattern name or pattern (e.g. @nx/*) of the package
 */
const getPackageRegex = (packageNameOrPattern) => {
    var _a, _b;
    const regexPrefix = '^(@[a-z0-9-~][a-z0-9-._~]*\\/)';
    const regexOne = '[a-z0-9-~][a-z0-9-._~]*$';
    const regexMany = '\\*$';
    let regexResult;
    if (new RegExp(`${regexPrefix}?${regexOne}`).test(packageNameOrPattern)) {
        // return name of the package as regex, if it matches the regex for only a single package
        regexResult = packageNameOrPattern;
    }
    else if (new RegExp(`${regexPrefix}?${regexMany}`).test(packageNameOrPattern)) {
        // return regex composed of the packages prefix (e.g. @nx/) and the regex for a single package
        // if the package name matches the regex for many packages (e.g. @nx/*)
        const prefix = (_b = (_a = new RegExp(regexPrefix).exec(packageNameOrPattern)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : '';
        regexResult = `^${prefix}${regexOne}`;
    }
    return regexResult;
};
exports.getPackageRegex = getPackageRegex;
//# sourceMappingURL=util.js.map