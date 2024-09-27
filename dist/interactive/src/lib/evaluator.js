"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Evaluator = void 0;
const tslib_1 = require("tslib");
const compare_versions_1 = require("compare-versions");
const fs = tslib_1.__importStar(require("fs"));
const lodash_1 = require("lodash");
const process = tslib_1.__importStar(require("process"));
const semver_1 = require("semver");
const toposort_1 = tslib_1.__importDefault(require("toposort"));
const util_1 = require("./util");
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
        this.client = new util_1.RegistryClient();
        this.heuristics = {};
        this.packageSets = [];
    }
    prepare(args) {
        var _a;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // get package.json path from args or current working directory & add filename if necessary
            const path = ((_a = args[util_1.ArgumentType.PATH]) !== null && _a !== void 0 ? _a : process.cwd()) + '/package.json';
            // read package.json to retrieve dependencies and peer dependencies
            const packageJson = JSON.parse(fs.readFileSync(path, { encoding: 'utf8' }));
            let openRequirements = [
                ...(packageJson.peerDependencies
                    ? Object.keys(packageJson.peerDependencies).map((name) => ({
                        name,
                        peer: true,
                    }))
                    : []),
                ...(packageJson.dependencies
                    ? Object.keys(packageJson.dependencies).map((name) => ({
                        name,
                        peer: false,
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
                    .filter((pr) => util_1.PACKAGE_BUNDLES.some((pb) => pr.name.startsWith(pb) && name.startsWith(pb)))
                    .forEach((pr) => (pr.versionRequirement = pinnedVersion));
            }
            // sort direct dependencies by heuristics
            openRequirements = this.sortByHeuristics(openRequirements);
            // save cache to disk
            this.client.writeDataToFiles();
            return openRequirements;
        });
    }
    evaluate(openRequirements) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const result = yield this.evaluationStep([], [], openRequirements, []);
            // save cache to disk
            this.client.writeDataToFiles();
            return result;
        });
    }
    evaluationStep(selectedPackageVersions, closedRequirements, openRequirements, edges) {
        var _a, _b, _c;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (openRequirements.length) {
                const currentRequirement = openRequirements.shift();
                let version = (_a = selectedPackageVersions.find((rp) => rp.name === currentRequirement.name)) === null || _a === void 0 ? void 0 : _a.semVerInfo;
                if (!version) {
                    // bundled packages need to be of the same version
                    version = (_b = selectedPackageVersions.find((rp) => util_1.PACKAGE_BUNDLES.some((pb) => rp.name.startsWith(pb) && currentRequirement.name.startsWith(pb)))) === null || _b === void 0 ? void 0 : _b.semVerInfo;
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
                // remove set if needed
                this.packageSets = this.packageSets.filter((ps) => ps.filter((entry) => entry[1]).some((entry) => !selectedPackageVersions.map((rp) => rp.name).includes(entry[0])));
                let conflictState = { state: util_1.State.CONFLICT };
                for (const versionToExplore of compatibleVersions) {
                    if (conflictState.state === util_1.State.CONFLICT) {
                        const packageDetails = yield this.client.getPackageDetails(currentRequirement.name, versionToExplore);
                        if (!this.allowPreReleases &&
                            Object.values(Object.assign(Object.assign({}, packageDetails.dependencies), packageDetails.peerDependencies)).some((d) => d.includes('-'))) {
                            continue;
                        }
                        if (packageDetails.peerDependencies) {
                            this.heuristics[currentRequirement.name].peers = Object.keys(packageDetails.peerDependencies).filter((peer) => this.directDependencies.includes(peer));
                        }
                        const { newOpenRequirements, newEdges } = yield this.addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements);
                        conflictState = yield this.evaluationStep(currentRequirement.peer &&
                            !selectedPackageVersions.some((rp) => rp.name === packageDetails.name && rp.semVerInfo === packageDetails.version)
                            ? [...selectedPackageVersions, { name: packageDetails.name, semVerInfo: packageDetails.version }]
                            : selectedPackageVersions, [...closedRequirements, currentRequirement], newOpenRequirements, [...edges, ...newEdges]);
                        // direct backtracking to package from a set
                        if (!currentRequirement.peer && !this.packageSets.find((ps) => ps.find((entry) => entry[0] === currentRequirement.name))) {
                            break;
                        }
                    }
                }
                if (conflictState.state === util_1.State.CONFLICT) {
                    this.heuristics[currentRequirement.name].conflictPotential++;
                    // create set
                    if (currentRequirement.peer) {
                        const parent = (_c = edges.find((e) => e[1] === currentRequirement.name)) === null || _c === void 0 ? void 0 : _c[0];
                        const oldPackageSet = this.packageSets.find((ps) => ps.find((entry) => entry[0] === parent));
                        let packageSet;
                        if (!oldPackageSet) {
                            packageSet = [];
                            this.packageSets.push(packageSet);
                        }
                        else {
                            packageSet = oldPackageSet;
                        }
                        packageSet.push([currentRequirement.name, currentRequirement.peer]);
                        edges.forEach((e) => {
                            if (e[1] === currentRequirement.name && !packageSet.find((entry) => entry[0] === e[0])) {
                                packageSet.push([e[0], false]);
                            }
                        });
                    }
                }
                return conflictState;
            }
            else {
                return { result: selectedPackageVersions, state: util_1.State.OK };
            }
        });
    }
    addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let newOpenRequirements = [...openRequirements];
            const newEdges = [];
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
                    newEdges.push([packageDetails.name, newRequirement.name, newRequirement.peer]);
                    yield this.createHeuristics(newRequirement.name);
                }
            }
            // sort new dependencies by heuristics
            newOpenRequirements = this.sortByHeuristics(newOpenRequirements);
            return { newOpenRequirements, newEdges };
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
                    versionRange: this.getRangeBetweenVersions(versions),
                };
            }
        });
    }
    getVersionReference(versions, func) {
        return versions.length === 1
            ? versions[0]
            : versions.find((version, idx, array) => func(version) - (array[idx + 1] ? func(array[idx + 1]) : 0) <= 1);
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
    /**
     * sorts the package requirements in place by heuristics
     * @param packageRequirements the package requirements to sort
     * @private
     */
    sortByHeuristics(packageRequirements) {
        var _a;
        // topological search with peers
        const nodes = [];
        const edges = [];
        for (const pr of packageRequirements) {
            const heuristics = this.heuristics[pr.name];
            if ((_a = heuristics.peers) === null || _a === void 0 ? void 0 : _a.length) {
                for (const peer of heuristics.peers) {
                    if (!nodes.includes(pr.name)) {
                        nodes.push(pr.name);
                    }
                    if (!nodes.includes(peer)) {
                        nodes.push(peer);
                    }
                    edges.push([pr.name, peer]);
                }
            }
        }
        const order = toposort_1.default.array(nodes, edges);
        const upper = packageRequirements.filter((pr) => nodes.includes(pr.name));
        const lower = packageRequirements.filter((pr) => !nodes.includes(pr.name));
        // sorting of package requirements with peers
        upper.sort((pr1, pr2) => {
            if (order.indexOf(pr1.name) > order.indexOf(pr2.name)) {
                return 1;
            }
            else {
                return -1;
            }
        });
        // sorting of package requirements without peers
        lower.sort((pr1, pr2) => {
            const heuristics1 = this.heuristics[pr1.name];
            const heuristics2 = this.heuristics[pr2.name];
            // direct dependencies
            if (heuristics1.isDirectDependency && !heuristics2.isDirectDependency) {
                return 1;
            }
            else if (!heuristics1.isDirectDependency && heuristics2.isDirectDependency) {
                return -1;
            }
            // conflict potential
            if (heuristics1.conflictPotential > heuristics2.conflictPotential) {
                return 1;
            }
            else if (heuristics1.conflictPotential < heuristics2.conflictPotential) {
                return -1;
            }
            // version range & size
            const versionRange1 = heuristics1.versionRange;
            const versionRange2 = heuristics2.versionRange;
            if (versionRange1.type === versionRange2.type) {
                if (versionRange1.value !== versionRange2.value) {
                    return versionRange1.value - versionRange2.value;
                }
                else {
                    return heuristics1.meanSize - heuristics2.meanSize;
                }
            }
            else if (heuristics1.versionRange.type.endsWith('major') || heuristics2.versionRange.type.endsWith('patch')) {
                return 1;
            }
            else {
                return -1;
            }
        });
        return [...upper, ...lower];
    }
    getRangeBetweenVersions(versions) {
        const v1 = this.getVersionReference(versions, semver_1.major);
        const v2 = versions[versions.length - 1];
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