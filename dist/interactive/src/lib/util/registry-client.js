"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistryClient = void 0;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const lodash_1 = require("lodash");
const query_registry_1 = require("query-registry");
const DETAILS_FILENAME = 'details';
class RegistryClient {
    constructor(details = {}, versions = {}, path = __dirname + '/../../data') {
        this.details = details;
        this.versions = versions;
        this.path = path;
    }
    getPackageDetails(name, version) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
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
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
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
    readDataFromFiles() {
        try {
            const details = (0, fs_1.readFileSync)(`${this.path}/${DETAILS_FILENAME}.json`, { encoding: 'utf8' });
            this.details = JSON.parse(details);
        }
        catch (e) {
            // file just doesn't exist
        }
    }
    writeDataToFiles() {
        if (!(0, fs_1.existsSync)(this.path)) {
            (0, fs_1.mkdirSync)(this.path);
        }
        (0, fs_1.writeFileSync)(`${this.path}/${DETAILS_FILENAME}.json`, JSON.stringify(this.details), { encoding: 'utf8' });
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