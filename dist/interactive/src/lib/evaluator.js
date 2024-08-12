"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Evaluator = void 0;
const tslib_1 = require("tslib");
const compare_versions_1 = require("compare-versions");
const fs = tslib_1.__importStar(require("fs"));
const process = tslib_1.__importStar(require("process"));
const interfaces_1 = require("./interfaces");
const registry_client_1 = require("./registry-client");
const semver_1 = require("semver");
const lodash_1 = require("lodash");
function isArgumentsCamelCase(args) {
    return !!args._;
}
class Evaluator {
    constructor(allowedMajorVersions = 2, allowedMinorAndPatchVersions = 10, allowPreReleases = false, pinVersions = false, forceRegeneration = false) {
        this.allowedMajorVersions = allowedMajorVersions;
        this.allowedMinorAndPatchVersions = allowedMinorAndPatchVersions;
        this.allowPreReleases = allowPreReleases;
        this.pinVersions = pinVersions;
        this.forceRegeneration = forceRegeneration;
        this.client = new registry_client_1.RegistryClient();
        this.heuristics = {};
        this.sortByHeuristics = (pr1, pr2) => {
            var _a, _b;
            const heuristics1 = this.heuristics[pr1.name]; // negative value prioritizes pr1
            const heuristics2 = this.heuristics[pr2.name]; // positive value prioritizes pr2
            // direct dependencies
            if (heuristics1.isDirectDependency || heuristics2.isDirectDependency) {
                if (!heuristics2.isDirectDependency) {
                    return 1;
                }
                else if (!heuristics1.isDirectDependency) {
                    return -1;
                }
                const hasPeer1 = (_a = heuristics1.peers) === null || _a === void 0 ? void 0 : _a.includes(pr2.name);
                const hasPeer2 = (_b = heuristics2.peers) === null || _b === void 0 ? void 0 : _b.includes(pr1.name);
                if (!hasPeer1 && hasPeer2) {
                    return 1;
                }
                else if (hasPeer1 && !hasPeer2) {
                    return -1;
                }
            }
            // conflict potential
            if (heuristics1.conflictPotential > heuristics2.conflictPotential) {
                return 1;
            }
            else if (heuristics1.conflictPotential < heuristics2.conflictPotential) {
                return -1;
            }
            // version range
            if (heuristics1.versionRange.type === heuristics2.versionRange.type) {
                if (heuristics1.versionRange.value === heuristics2.versionRange.value) {
                    // size
                    return heuristics1.meanSize - heuristics2.meanSize;
                }
                return heuristics1.versionRange.value - heuristics2.versionRange.value;
            }
            else {
                if (heuristics1.versionRange.type.endsWith('major') || heuristics2.versionRange.type.endsWith('patch')) {
                    return 1;
                }
                return -1;
            }
        };
    }
    prepare(args) {
        var _a;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // get package.json path from args or current working directory & add filename if necessary
            const path = ((_a = args[interfaces_1.ArgumentType.PATH]) !== null && _a !== void 0 ? _a : process.cwd()) + '/package.json';
            // read package.json to retrieve dependencies and peer dependencies
            const packageJson = JSON.parse(fs.readFileSync(path, { encoding: 'utf8' }));
            const openRequirements = [
                ...(packageJson.peerDependencies
                    ? Object.keys(packageJson.peerDependencies).map((name) => ({
                        name,
                        peer: true,
                    }))
                    : []),
                ...(packageJson.dependencies
                    ? Object.keys(packageJson.dependencies).map((name) => ({
                        name,
                        peer: false, // TODO: check if peers have to be truthy or not
                    }))
                    : []),
            ];
            this.directDependencies = openRequirements.map((pr) => pr.name);
            // load cache from disk
            this.client.readDataFromFiles(this.forceRegeneration);
            // get pinned version from command or package.json
            const pinnedVersions = isArgumentsCamelCase(args)
                ? yield this.getPinnedVersions(args._, Object.assign(Object.assign({}, packageJson.dependencies), packageJson.peerDependencies))
                : {};
            // add heuristics for direct dependencies & pinned versions
            for (const { name } of openRequirements) {
                yield this.createHeuristics(name, pinnedVersions[name], true);
            }
            for (const [name, pinnedVersion] of Object.entries(pinnedVersions)) {
                yield this.createHeuristics(name, pinnedVersion);
                // add missing pinned versions to open requirements --> packages the user explicitly installs
                const openRequirement = openRequirements.find((pr) => pr.name === name);
                if (openRequirement) {
                    openRequirement.versionRequirement = pinnedVersion;
                }
                else {
                    openRequirements.push({ name, peer: false, versionRequirement: pinnedVersion });
                }
                // edit bundled packages to also be of the same version
                openRequirements
                    .filter((pr) => interfaces_1.PACKAGE_BUNDLES.some((pb) => pr.name.startsWith(pb) && name.startsWith(pb)))
                    .forEach((pr) => (pr.versionRequirement = pinnedVersion));
            }
            // sort direct dependencies by heuristics
            openRequirements.sort(this.sortByHeuristics);
            // save cache to disk
            this.client.writeDataToFiles();
            return openRequirements;
        });
    }
    evaluate(openRequirements) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const result = yield this.evaluationStep([], [], openRequirements);
            // save cache to disk
            this.client.writeDataToFiles();
            return result;
        });
    }
    evaluationStep(selectedPackageVersions, closedRequirements, openRequirements) {
        var _a, _b;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (openRequirements.length) {
                const currentRequirement = openRequirements.shift();
                let version = (_a = selectedPackageVersions.find((rp) => rp.name === currentRequirement.name)) === null || _a === void 0 ? void 0 : _a.semVerInfo;
                if (!version) {
                    // bundled packages need to be of the same version
                    version = (_b = selectedPackageVersions.find((rp) => interfaces_1.PACKAGE_BUNDLES.some((pb) => rp.name.startsWith(pb) && currentRequirement.name.startsWith(pb)))) === null || _b === void 0 ? void 0 : _b.semVerInfo;
                }
                let availableVersions;
                if (version) {
                    availableVersions = [version];
                }
                else {
                    availableVersions = (yield this.client.getAllVersionsFromRegistry(currentRequirement.name)).versions
                        .sort(compare_versions_1.compareVersions)
                        .reverse();
                }
                const pinnedVersion = this.heuristics[currentRequirement.name].pinnedVersion;
                if ((0, semver_1.validRange)(pinnedVersion)) {
                    availableVersions = availableVersions.filter((v) => v && (0, compare_versions_1.satisfies)(v, pinnedVersion));
                }
                const versionReference = this.getVersionReference(availableVersions, semver_1.major);
                let compatibleVersions = currentRequirement.versionRequirement && currentRequirement.versionRequirement !== '*'
                    ? availableVersions.filter((v) => v && (0, compare_versions_1.satisfies)(v, currentRequirement.versionRequirement.replace('ˆ', '^')))
                    : availableVersions.filter((v) => v &&
                        (0, semver_1.major)(v) <= (0, semver_1.major)(versionReference) && // version should be below the reference
                        (0, compare_versions_1.compareVersions)(v, Math.max((0, semver_1.major)(versionReference) - this.allowedMajorVersions, 0).toString()) !== -1 &&
                        (this.allowPreReleases || !v.includes('-')));
                compatibleVersions = this.getVersionsInMinorAndPatchRange(compatibleVersions);
                let conflictState = { state: interfaces_1.State.CONFLICT };
                for (const versionToExplore of compatibleVersions) {
                    if (conflictState.state === interfaces_1.State.CONFLICT) {
                        const packageDetails = yield this.client.getPackageDetails(currentRequirement.name, versionToExplore);
                        if (!this.allowPreReleases && Object.values(Object.assign(Object.assign({}, packageDetails.dependencies), packageDetails.peerDependencies)).some((d) => d.includes('-'))) {
                            continue;
                        }
                        if (packageDetails.peerDependencies) {
                            this.heuristics[currentRequirement.name].peers = Object.keys(packageDetails.peerDependencies).filter((peer) => this.directDependencies.includes(peer));
                        }
                        conflictState = yield this.evaluationStep(currentRequirement.peer &&
                            !selectedPackageVersions.some((rp) => rp.name === packageDetails.name && rp.semVerInfo === packageDetails.version)
                            ? [...selectedPackageVersions, { name: packageDetails.name, semVerInfo: packageDetails.version }]
                            : selectedPackageVersions, [...closedRequirements, currentRequirement], yield this.addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements));
                    }
                }
                if (conflictState.state === interfaces_1.State.CONFLICT) {
                    this.heuristics[currentRequirement.name].conflictPotential++;
                }
                return conflictState;
            }
            else {
                return { result: selectedPackageVersions, state: interfaces_1.State.OK };
            }
        });
    }
    addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const newOpenRequirements = [...openRequirements];
            const newRequirements = [
                ...(packageDetails.peerDependencies
                    ? Object.entries(packageDetails.peerDependencies).map(([name, versionRequirement]) => ({
                        name,
                        versionRequirement,
                        peer: true,
                    }))
                    : []),
                ...(packageDetails.dependencies
                    ? Object.entries(packageDetails.dependencies).map(([name, versionRequirement]) => ({
                        name,
                        versionRequirement,
                        peer: false,
                    }))
                    : []),
            ];
            // add requirements to open requirements if needed & create heuristics if none exist
            for (const newRequirement of newRequirements) {
                if (!newOpenRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement) &&
                    !closedRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement)) {
                    newOpenRequirements.push(newRequirement);
                    yield this.createHeuristics(newRequirement.name);
                }
            }
            // sort new dependencies by heuristics
            newOpenRequirements.sort(this.sortByHeuristics);
            return newOpenRequirements;
        });
    }
    createHeuristics(name, pinnedVersion, isDirectDependency = false) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this.heuristics[name]) {
                const { versions, meanSize } = yield this.client.getAllVersionsFromRegistry(name);
                versions.sort(compare_versions_1.compareVersions);
                versions.reverse();
                // use a version as reference that is in the expected range
                const versionReference = this.getVersionReference(versions, semver_1.major);
                let versionsForPeers = versions.filter((v) => v &&
                    (0, semver_1.major)(v) <= (0, semver_1.major)(versionReference) && // version should be below the reference
                    (0, compare_versions_1.compareVersions)(v, Math.max((0, semver_1.major)(versionReference) - this.allowedMajorVersions, 0).toString()) !== -1 &&
                    (this.allowPreReleases || !v.includes('-')) &&
                    (!pinnedVersion || (0, compare_versions_1.satisfies)(v, pinnedVersion)));
                versionsForPeers = this.getVersionsInMinorAndPatchRange(versionsForPeers);
                // peers heuristic
                const peers = [];
                for (const version of versionsForPeers) {
                    const { peerDependencies } = yield this.client.getPackageDetails(name, version);
                    if (peerDependencies) {
                        for (const peerDependency of Object.keys(peerDependencies)) {
                            if (!peers.includes(peerDependency) && this.directDependencies.includes(peerDependency)) {
                                peers.push(peerDependency);
                            }
                        }
                    }
                }
                this.heuristics[name] = {
                    conflictPotential: 0,
                    isDirectDependency,
                    meanSize,
                    peers,
                    pinnedVersion,
                    versionRange: this.getRangeBetweenVersions(versions[0], versions[versions.length - 1]),
                };
            }
        });
    }
    getVersionReference(versions, func) {
        return versions.length === 1 ? versions[0] : versions.find((version, idx, array) => func(version) - (array[idx + 1] ? func(array[idx + 1]) : 0) <= 1);
    }
    getVersionsInMinorAndPatchRange(versions) {
        const result = [];
        const majorVersions = (0, lodash_1.uniq)(versions.map((v) => (0, semver_1.major)(v)));
        for (const majorVersion of majorVersions) {
            const currentVersions = versions.filter((v) => (0, semver_1.major)(v) === majorVersion);
            result.push(...currentVersions.slice(0, this.allowedMinorAndPatchVersions));
        }
        return result;
    }
    getRangeBetweenVersions(v1, v2) {
        let type = (0, semver_1.diff)(v1, v2);
        let value;
        switch (type) {
            case 'major':
            case 'premajor':
                value = (0, semver_1.major)(v1) - (0, semver_1.major)(v2);
                type = 'major';
                break;
            case 'minor':
            case 'preminor':
                value = (0, semver_1.minor)(v1) - (0, semver_1.minor)(v2);
                type = 'minor';
                break;
            default:
                value = (0, semver_1.patch)(v1) - (0, semver_1.patch)(v2);
                type = 'patch';
                break;
        }
        return { type, value: Math.abs(value) };
    }
    getPinnedVersions(params, dependencies) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const pinnedVersions = {};
            let pinPackageJsonVersions = false;
            const command = params.shift();
            if (command === 'i' || command === 'install') {
                if (params.length) {
                    // get versions from params
                    for (const param of params) {
                        if (typeof param === 'number') {
                            continue;
                        }
                        const paramSplit = param.split(/(?<!^)@/);
                        const name = paramSplit.shift();
                        if (!paramSplit.length) {
                            const versions = (yield this.client.getAllVersionsFromRegistry(name)).versions
                                .filter((v) => this.allowPreReleases || !v.includes('-'))
                                .sort(compare_versions_1.compareVersions)
                                .reverse();
                            pinnedVersions[name] = versions[0];
                        }
                        else {
                            pinnedVersions[name] = paramSplit.shift();
                        }
                    }
                    return pinnedVersions;
                }
                pinPackageJsonVersions = true;
            }
            if (pinPackageJsonVersions || this.pinVersions) {
                // get versions from dependencies
                Object.entries(dependencies)
                    .filter(([name]) => !pinnedVersions[name])
                    .forEach(([name, version]) => (pinnedVersions[name] = version));
            }
            return pinnedVersions;
        });
    }
}
exports.Evaluator = Evaluator;
//# sourceMappingURL=evaluator.js.map