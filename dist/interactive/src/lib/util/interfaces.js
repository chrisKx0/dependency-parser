"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.State = exports.Severity = exports.ArgumentType = exports.PACKAGE_BUNDLES = void 0;
// array positions must be kept
exports.PACKAGE_BUNDLES = ['@nx']; // @TODO add bundles like @angular, @nestjs when they are more robust
var ArgumentType;
(function (ArgumentType) {
    ArgumentType["ALL_DEPENDENCIES"] = "all-dependencies";
    ArgumentType["COLLECT_METRICS"] = "collect-metrics";
    ArgumentType["EXCLUDE"] = "exclude";
    ArgumentType["FORCE"] = "force";
    ArgumentType["INCLUDE"] = "include";
    ArgumentType["INSTALL"] = "install";
    ArgumentType["MAJOR_VERSIONS"] = "major-versions";
    ArgumentType["MINOR_VERSIONS"] = "minor-versions";
    ArgumentType["MIGRATE"] = "migrate";
    ArgumentType["MODIFY_JSON"] = "modify-json";
    ArgumentType["PACKAGE_MANAGER"] = "package-manager";
    ArgumentType["PATH"] = "path";
    ArgumentType["KEEP_VERSIONS"] = "keep-versions";
    ArgumentType["PRE_RELEASE"] = "pre-release";
    ArgumentType["RETRY"] = "retry";
    ArgumentType["SKIP_PROMPTS"] = "skip-prompts";
})(ArgumentType || (exports.ArgumentType = ArgumentType = {}));
var Severity;
(function (Severity) {
    Severity["INFO"] = "info";
    Severity["SUCCESS"] = "success";
    Severity["WARNING"] = "warning";
    Severity["ERROR"] = "error";
})(Severity || (exports.Severity = Severity = {}));
var State;
(function (State) {
    State["OK"] = "OK";
    State["CONFLICT"] = "CONFLICT";
})(State || (exports.State = State = {}));
//# sourceMappingURL=interfaces.js.map