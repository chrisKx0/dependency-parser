"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exclude = void 0;
const exclude = (excludedPackage) => {
    var _a, _b;
    const regexPrefix = '^(@[a-z0-9-~][a-z0-9-._~]*\\/)';
    const regexOne = '[a-z0-9-~][a-z0-9-._~]*$';
    const regexMany = '\\*$';
    let regexResult;
    if (new RegExp(`${regexPrefix}?${regexOne}`).test(excludedPackage)) {
        regexResult = excludedPackage;
    }
    else if (new RegExp(`${regexPrefix}?${regexMany}`).test(excludedPackage)) {
        const prefix = (_b = (_a = new RegExp(regexPrefix).exec(excludedPackage)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : '';
        regexResult = `^${prefix}${regexOne}`;
    }
    return regexResult;
};
exports.exclude = exclude;
//# sourceMappingURL=util.js.map