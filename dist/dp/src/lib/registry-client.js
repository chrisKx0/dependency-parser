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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistryClient = void 0;
const fs_1 = require("fs");
const query_registry_1 = require("query-registry");
const lodash_1 = require("lodash");
const DETAILS_FILENAME = 'details.json';
const VERSIONS_FILENAME = 'versions.json';
class RegistryClient {
    constructor(details = {}, versions = {}, path = __dirname + '/../../data') {
        this.details = details;
        this.versions = versions;
        this.path = path;
    }
    getPackageDetails(name, version) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = `${name}@${version}`;
            let details = this.details[key];
            if (!details) {
                const manifest = yield (0, query_registry_1.getPackageManifest)({ name, version });
                details = {
                    name: manifest.name,
                    version: manifest.version,
                    dependencies: manifest.dependencies,
                    peerDependencies: manifest.peerDependencies,
                };
                this.details[key] = details;
            }
            return details;
        });
    }
    getAllVersionsFromRegistry(name) {
        return __awaiter(this, void 0, void 0, function* () {
            let versions = this.versions[name];
            if (!versions) {
                versions = { versions: [], meanSize: 0 };
                const packument = yield (0, query_registry_1.getPackument)({ name });
                versions.versions = (packument === null || packument === void 0 ? void 0 : packument.versions) ? Object.keys(packument.versions) : [];
                if (packument.versions) {
                    versions.versions = Object.keys(packument.versions).filter((version) => version);
                    const sizes = Object.values(packument.versions)
                        .map((rpm) => { var _a; return (_a = rpm === null || rpm === void 0 ? void 0 : rpm.dist) === null || _a === void 0 ? void 0 : _a.unpackedSize; })
                        .filter((n) => !isNaN(n));
                    versions.meanSize = this.calculateMeanSize(sizes);
                }
                this.versions[name] = versions;
            }
            return versions;
        });
    }
    readDataFromFiles(forceRegeneration = false) {
        if (forceRegeneration) {
            return;
        }
        try {
            const details = (0, fs_1.readFileSync)(`${this.path}/${DETAILS_FILENAME}`, { encoding: 'utf8' });
            this.details = JSON.parse(details);
        }
        catch (e) {
            // file just doesn't exist
        }
        try {
            const versions = (0, fs_1.readFileSync)(`${this.path}/${VERSIONS_FILENAME}`, { encoding: 'utf8' });
            this.versions = JSON.parse(versions);
        }
        catch (e) {
            // file just doesn't exist
        }
    }
    writeDataToFiles() {
        if (!(0, fs_1.existsSync)(this.path)) {
            (0, fs_1.mkdirSync)(this.path);
        }
        (0, fs_1.writeFileSync)(`${this.path}/${DETAILS_FILENAME}`, JSON.stringify(this.details), { encoding: 'utf8' });
        (0, fs_1.writeFileSync)(`${this.path}/${VERSIONS_FILENAME}`, JSON.stringify(this.versions), { encoding: 'utf8' });
    }
    calculateMeanSize(sizes) {
        if (!sizes.length) {
            return 0;
        }
        return (0, lodash_1.sum)(sizes) / sizes.length;
    }
}
exports.RegistryClient = RegistryClient;
//# sourceMappingURL=registry-client.js.map