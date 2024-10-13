"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistryClient = void 0;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const lodash_1 = require("lodash");
const query_registry_1 = require("query-registry");
const DETAILS_FILENAME = 'details.json';
class RegistryClient {
    constructor(path = __dirname + '/../../../data') {
        this.path = path;
        this.details = {};
        this.versions = {};
    }
    /**
     * retrieves package details from npm registry for a specific package version (with cache)
     * @param name name of the package
     * @param version version of the package
     */
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
    /**
     * retrieves all versions and sizes of a package from npm registry (with cache)
     * @param name name of the package
     */
    getAllVersionsFromRegistry(name) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let versions = this.versions[name];
            if (!versions) {
                versions = { versions: [], meanSize: 0 };
                const packument = yield (0, query_registry_1.getPackument)({ name });
                // extract versions from packument
                versions.versions = (packument === null || packument === void 0 ? void 0 : packument.versions) ? Object.keys(packument.versions) : [];
                if (packument.versions) {
                    versions.versions = Object.keys(packument.versions).filter((version) => version);
                    // extract sizes of each package version and calculate their mean size
                    const sizes = Object.values(packument.versions)
                        .map((rpm) => { var _a; return (_a = rpm === null || rpm === void 0 ? void 0 : rpm.dist) === null || _a === void 0 ? void 0 : _a.unpackedSize; })
                        .filter((n) => !isNaN(n));
                    versions.meanSize = sizes.length ? (0, lodash_1.sum)(sizes) / sizes.length : 0;
                }
                this.versions[name] = versions;
            }
            return versions;
        });
    }
    /**
     * loads a saved cache from file system
     */
    readDataFromFiles() {
        try {
            const details = (0, fs_1.readFileSync)(`${this.path}/${DETAILS_FILENAME}`, { encoding: 'utf8' });
            this.details = JSON.parse(details);
        }
        catch (e) {
            // best practice if file doesn't exist
        }
    }
    /**
     * saves the cache to file system
     */
    writeDataToFiles() {
        if (!(0, fs_1.existsSync)(this.path)) {
            (0, fs_1.mkdirSync)(this.path);
        }
        (0, fs_1.writeFileSync)(`${this.path}/${DETAILS_FILENAME}`, JSON.stringify(this.details), { encoding: 'utf8' });
    }
}
exports.RegistryClient = RegistryClient;
//# sourceMappingURL=registry-client.js.map