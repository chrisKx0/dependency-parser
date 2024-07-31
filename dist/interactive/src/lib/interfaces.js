"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.State = exports.ArgumentType = exports.PACKAGE_BUNDLES = void 0;
// array positions must be kept
exports.PACKAGE_BUNDLES = ['@nx', '@angular'];
var ArgumentType;
(function (ArgumentType) {
    ArgumentType["ALL_DEPENDENCIES"] = "all-dependencies";
    ArgumentType["FORCE_REGENERATION"] = "force-regeneration";
    ArgumentType["INSTALL"] = "install";
    ArgumentType["MAJOR_VERSIONS"] = "major-versions";
    ArgumentType["MIGRATE"] = "migrate";
    ArgumentType["MODIFY_JSON"] = "modify-json";
    ArgumentType["PACKAGE_MANAGER"] = "package-manager";
    ArgumentType["PATH"] = "path";
    ArgumentType["PIN_VERSIONS"] = "pin-versions";
    ArgumentType["PRE_RELEASE"] = "pre-release";
    ArgumentType["RETRY"] = "retry";
    ArgumentType["SKIP_PROMPTS"] = "hide-prompts";
})(ArgumentType || (exports.ArgumentType = ArgumentType = {}));
var State;
(function (State) {
    State["OK"] = "OK";
    State["CONFLICT"] = "CONFLICT";
})(State || (exports.State = State = {}));
//# sourceMappingURL=interfaces.js.map