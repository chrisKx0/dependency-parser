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
/**
 * checks if args are of type ArgumentsCamelCase
 * @param args args of type ArgumentsCamelCase or ArgsUnattended
 */
function isArgumentsCamelCase(args) {
    return !!args._;
}
class Evaluator {
    constructor(allowedMajorVersions = 2, allowedMinorAndPatchVersions = 10, allowPreReleases = true, pinVersions = false, force = false, client = new util_1.RegistryClient()) {
        this.allowedMajorVersions = allowedMajorVersions;
        this.allowedMinorAndPatchVersions = allowedMinorAndPatchVersions;
        this.allowPreReleases = allowPreReleases;
        this.pinVersions = pinVersions;
        this.force = force;
        this.client = client;
        this.heuristics = {};
        this.metrics = {
            checkedDependencies: 0,
            checkedPeers: 0,
            checkedVersions: 0,
            resolvedPackages: 0,
            resolvedPeers: 0,
        };
        this.packageSets = [];
    }
    /**
     * prepares the first set of open requirements by retrieving them from package.json or command line.
     * heuristics will be created for these open requirements too
     * @param args command line arguments
     * @param excludedPackages packages to exclude from preparation
     * @param includedPackages packages that are allowed as initial open requirements
     */
    prepare(args, excludedPackages, includedPackages) {
        var _a;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // get package.json path from args or current working directory
            const path = ((_a = args[util_1.ArgumentType.PATH]) !== null && _a !== void 0 ? _a : process.cwd()) + '/package.json';
            // read package.json to retrieve dependencies and peer dependencies and add them to open requirements
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
            // exclude packages that are specified in excludedPackages
            openRequirements = openRequirements.filter((pr) => !excludedPackages.some((ep) => new RegExp(ep).test(pr.name)));
            // include only packages that are specified in includedPackages
            if (includedPackages.length) {
                openRequirements = openRequirements.filter((pr) => includedPackages.some((ep) => new RegExp(ep).test(pr.name)));
            }
            // load cache from file system
            this.client.readDataFromFiles();
            // get pinned versions for packages from command or package.json, if specified
            const dependencies = openRequirements.reduce((acc, curr) => { var _a, _b, _c; return (Object.assign(Object.assign({}, acc), { [curr.name]: (_b = (_a = packageJson.peerDependencies) === null || _a === void 0 ? void 0 : _a[curr.name]) !== null && _b !== void 0 ? _b : (_c = packageJson.dependencies) === null || _c === void 0 ? void 0 : _c[curr.name] })); }, {});
            const pinnedVersions = isArgumentsCamelCase(args) ? yield this.getPinnedVersions(args._, dependencies) : {};
            // add heuristics for direct dependencies & pinned versions if needed
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
                // @TODO: make package bundles more robust
                // edit bundled packages to also be of the same version
                openRequirements
                    .filter((pr) => util_1.PACKAGE_BUNDLES.some((pb) => pr.name.startsWith(pb) && name.startsWith(pb)))
                    .forEach((pr) => (pr.versionRequirement = pinnedVersion));
            }
            openRequirements = this.sortByHeuristics(openRequirements);
            // save cache to disk
            this.client.writeDataToFiles();
            return openRequirements;
        });
    }
    /**
     * performs evaluation for open requirements
     * @param openRequirements initial open requirements of the evaluation
     */
    evaluate(openRequirements) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // call first evaluation step with only open requirements
            const conflictState = yield this.evaluationStep([], [], openRequirements, []);
            // save cache to disk
            this.client.writeDataToFiles();
            return { conflictState, metrics: this.metrics };
        });
    }
    /**
     * step of the evaluation in which a version for the next open requirement is selected
     * @param selectedPackageVersions the already selected peer dependency versions
     * @param closedRequirements all already closed requirements
     * @param openRequirements open requirements that are still open
     * @param edges edges between the requirements for backtracking purposes
     * @private
     */
    evaluationStep(selectedPackageVersions, closedRequirements, openRequirements, edges) {
        var _a, _b, _c, _d;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (openRequirements.length) {
                const currentRequirement = openRequirements.shift();
                // check for fixed versions
                let version = currentRequirement.peer && ((_a = selectedPackageVersions.find((rp) => rp.name === currentRequirement.name)) === null || _a === void 0 ? void 0 : _a.semVerInfo);
                // @TODO: make package bundles more robust
                if (!version) {
                    // bundled packages need to be of the same version
                    version = (_b = selectedPackageVersions.find((rp) => util_1.PACKAGE_BUNDLES.some((pb) => rp.name.startsWith(pb) && currentRequirement.name.startsWith(pb)))) === null || _b === void 0 ? void 0 : _b.semVerInfo;
                }
                let availableVersions;
                // available versions include either the fixed version only or all versions from npm registry in descending order
                if (version) {
                    availableVersions = [version];
                }
                else {
                    availableVersions = (yield this.client.getAllVersionsFromRegistry(currentRequirement.name)).versions
                        .sort(compare_versions_1.compareVersions)
                        .reverse();
                }
                // if the package has a pinned version, check if its valid and filter available version by it
                const pinnedVersion = this.heuristics[currentRequirement.name].pinnedVersion;
                if ((0, semver_1.validRange)(pinnedVersion)) {
                    availableVersions = availableVersions.filter((v) => v && (0, compare_versions_1.satisfies)(v, pinnedVersion));
                }
                // if version requirement is no valid requirement, remove it entirely
                // @TODO: handle versions that are urls or prefixed: with npm:, file:, etc.
                const versionRequirement = (0, semver_1.validRange)(currentRequirement.versionRequirement);
                if (!versionRequirement) {
                    delete currentRequirement.versionRequirement;
                }
                // find a reasonable reference version
                const versionReference = this.getVersionReference(availableVersions, semver_1.major);
                let compatibleVersions = versionRequirement && versionRequirement !== '*'
                    ? // if there is a version requirement, compatible version have to satisfy this requirement
                        availableVersions.filter((v) => v && (0, compare_versions_1.satisfies)(v, versionRequirement.replace('ˆ', '^')))
                    : // otherwise compatible versions must be below the reference, in the allowed major version range and satisfy the pre-release constraint
                        availableVersions.filter((v) => {
                            var _a;
                            return v &&
                                (0, semver_1.major)(v) <= (0, semver_1.major)(versionReference) &&
                                (0, compare_versions_1.compareVersions)(v, Math.max((0, semver_1.major)(versionReference) - this.allowedMajorVersions, 0).toString()) !== -1 &&
                                (!v.includes('-') || (!((_a = this.heuristics[currentRequirement.name]) === null || _a === void 0 ? void 0 : _a.isDirectDependency) && this.allowPreReleases));
                        });
                // also filter them by their allowed minor and patch range
                compatibleVersions = this.getVersionsInMinorAndPatchRange(compatibleVersions);
                // remove package set if needed
                if (!this.force) {
                    this.packageSets = this.packageSets.filter((ps) => ps.filter((entry) => entry[1]).some((entry) => !selectedPackageVersions.map((rp) => rp.name).includes(entry[0])));
                }
                // collect metrics
                this.metrics.checkedDependencies++;
                if (currentRequirement.peer) {
                    this.metrics.checkedPeers++;
                }
                let conflictState = { state: util_1.State.CONFLICT };
                let backtracking = false;
                // go through all compatible versions
                for (const versionToExplore of compatibleVersions) {
                    if (conflictState.state === util_1.State.CONFLICT) {
                        // skip over versions that violate pre-release constraint
                        if (!((_c = this.heuristics[currentRequirement.name]) === null || _c === void 0 ? void 0 : _c.isDirectDependency) && !this.allowPreReleases && versionToExplore.includes('-')) {
                            continue;
                        }
                        // collect metric
                        this.metrics.checkedVersions++;
                        // load package details and update peers heuristic
                        const packageDetails = yield this.client.getPackageDetails(currentRequirement.name, versionToExplore);
                        if (packageDetails.peerDependencies) {
                            this.heuristics[currentRequirement.name].peers = Object.keys(packageDetails.peerDependencies);
                        }
                        // update open requirements
                        const { newOpenRequirements, newEdges } = yield this.addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements, edges);
                        // go to next evaluation step with updated requirements and selected versions
                        conflictState = yield this.evaluationStep(currentRequirement.peer &&
                            !selectedPackageVersions.some((rp) => rp.name === packageDetails.name && rp.semVerInfo === packageDetails.version)
                            ? [...selectedPackageVersions, { name: packageDetails.name, semVerInfo: packageDetails.version }]
                            : selectedPackageVersions, [...closedRequirements, currentRequirement], newOpenRequirements, newEdges);
                        // directly backtrack to a package from a set, if current requirement is not a peer dependency
                        // otherwise try other versions too
                        if (!this.force &&
                            (this.packageSets.length || !currentRequirement.peer) &&
                            !this.packageSets.find((ps) => ps.find((entry) => entry[0] === currentRequirement.name))) {
                            backtracking = true;
                            break;
                        }
                    }
                }
                // if no version is eligible and no backtracking is needed, a new package set is created for peer dependencies
                if (conflictState.state === util_1.State.CONFLICT && !backtracking) {
                    this.heuristics[currentRequirement.name].conflictPotential++;
                    if (!this.force && currentRequirement.peer) {
                        // retrieve old package set that includes parent of current requirement
                        const parent = (_d = edges.find((edge) => edge[1] === currentRequirement.name)) === null || _d === void 0 ? void 0 : _d[0];
                        const oldPackageSet = this.packageSets.find((ps) => ps.find((entry) => entry[0] === parent));
                        let packageSet;
                        if (!oldPackageSet) {
                            // create new set if old package set doesn't exist
                            packageSet = [];
                            this.packageSets.push(packageSet);
                        }
                        else {
                            packageSet = oldPackageSet;
                        }
                        // if package set has no entry matching the current requirement, add it
                        if (!packageSet.find((entry) => entry[0] === currentRequirement.name && entry[1] === currentRequirement.peer)) {
                            packageSet.push([currentRequirement.name, currentRequirement.peer]);
                        }
                        // adds parents of current requirement and their non-peer parents to package set
                        edges.forEach((edge) => {
                            // for every parent of current requirement that isn't already in package set
                            if (edge[1] === currentRequirement.name && !packageSet.find((entry) => entry[0] === edge[0])) {
                                // check if parent is peer itself
                                const parentEdges = edges.filter((parentEdge) => parentEdge[1] === edge[0]);
                                const hasPeerParent = parentEdges.some((parentEdge) => parentEdge[2]);
                                // add parent (with peer status) to package set, if not already included
                                if (!packageSet.find((entry) => entry[0] === edge[0] && entry[1] === hasPeerParent)) {
                                    packageSet.push([edge[0], hasPeerParent]);
                                }
                                // add parents of parent to package set, if they are no peer and not already included
                                for (const parentEdge of parentEdges) {
                                    if (!packageSet.find((entry) => entry[0] === parentEdge[0] && !entry[1])) {
                                        packageSet.push([parentEdge[0], false]);
                                    }
                                }
                            }
                        });
                    }
                }
                return conflictState;
            }
            else {
                // collect metrics
                this.metrics.resolvedPackages = closedRequirements.length;
                this.metrics.resolvedPeers = selectedPackageVersions.length;
                // if all open requirements are closed, return the selected package versions and leave recursion
                return { result: selectedPackageVersions, state: util_1.State.OK };
            }
        });
    }
    /**
     * updates the open requirements with new dependencies of the current package
     * @param packageDetails details of the current package with peer dependencies and dependencies
     * @param closedRequirements the already closed requirements
     * @param openRequirements the current open requirements
     * @param edges all edges between packages, that have been seen
     * @private
     */
    addDependenciesToOpenSet(packageDetails, closedRequirements, openRequirements, edges) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let newOpenRequirements = [...openRequirements];
            const newEdges = [...edges];
            // get possible new requirements from package details of the current package
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
            // add new requirement to open requirements if not already closed or included & create edge & heuristic if needed
            for (const newRequirement of newRequirements) {
                if (!newOpenRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement) &&
                    !closedRequirements.some((pr) => pr.name === newRequirement.name && pr.versionRequirement === newRequirement.versionRequirement)) {
                    newOpenRequirements.push(newRequirement);
                    const existingEdge = newEdges.find((e) => e[0] === packageDetails.name && e[1] === newRequirement.name);
                    if (existingEdge) {
                        // change peer status of existing edge
                        existingEdge[2] = newRequirement.peer;
                    }
                    else {
                        // add edge between current package and its dependency
                        newEdges.push([packageDetails.name, newRequirement.name, newRequirement.peer]);
                    }
                    yield this.createHeuristics(newRequirement.name);
                }
            }
            // sort new dependencies by heuristics
            newOpenRequirements = this.sortByHeuristics(newOpenRequirements);
            return { newOpenRequirements, newEdges };
        });
    }
    /**
     * creates new heuristic entry for a package if not already existing
     * @param name package name
     * @param pinnedVersion pinned version of package (optional)
     * @param isDirectDependency if the package is a direct dependency
     * @private
     */
    createHeuristics(name, pinnedVersion, isDirectDependency = false) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this.heuristics[name]) {
                // retrieve possible versions and mean size of all versions
                const { versions, meanSize } = yield this.client.getAllVersionsFromRegistry(name);
                // sort versions descending
                versions.sort(compare_versions_1.compareVersions);
                versions.reverse();
                // use a version as reference that is in the expected range
                const versionReference = this.getVersionReference(versions, semver_1.major);
                // get filtered versions that are below the reference, in the allowed major version range
                // and that satisfy the pinned versions and pre-release constraint
                let versionsForPeers = versions.filter((v) => v &&
                    (0, semver_1.major)(v) <= (0, semver_1.major)(versionReference) &&
                    (0, compare_versions_1.compareVersions)(v, Math.max((0, semver_1.major)(versionReference) - this.allowedMajorVersions, 0).toString()) !== -1 &&
                    (!v.includes('-') || (!isDirectDependency && this.allowPreReleases)) &&
                    (!pinnedVersion || (0, compare_versions_1.satisfies)(v, pinnedVersion)));
                // also filter them by their allowed minor and patch range
                versionsForPeers = this.getVersionsInMinorAndPatchRange(versionsForPeers);
                // get peer dependencies of all these versions and add them to the peers of this heuristic
                const peers = [];
                for (const version of versionsForPeers) {
                    const { peerDependencies } = yield this.client.getPackageDetails(name, version);
                    if (peerDependencies) {
                        for (const peerDependency of Object.keys(peerDependencies)) {
                            if (!peers.includes(peerDependency)) {
                                peers.push(peerDependency);
                            }
                        }
                    }
                }
                // create the actual heuristic entry with all values
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
    /**
     * find a reasonable reference version that is not more than 1 away from its predecessor
     * @param versions all versions that possible
     * @param func compare function for versions (major, minor or patch)
     * @private
     */
    getVersionReference(versions, func) {
        return versions.length === 1
            ? versions[0]
            : versions.find((version, idx, array) => func(version) - (array[idx + 1] ? func(array[idx + 1]) : 0) <= 1);
    }
    /**
     * get filtered versions that are in the allowed range of minor and patch versions
     * @param versions versions to filter
     * @private
     */
    getVersionsInMinorAndPatchRange(versions) {
        const result = [];
        const majorVersions = (0, lodash_1.uniq)(versions.map((v) => (0, semver_1.major)(v)));
        // for each major version, only use allowed number of minor and patch versions
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
        const nodes = [];
        const edges = [];
        const indirectEdges = [];
        // add peer dependencies to nodes and their important connections to edges
        for (const pr of packageRequirements) {
            if (pr.peer && !nodes.includes(pr.name)) {
                nodes.push(pr.name);
            }
            const heuristics = this.heuristics[pr.name];
            if ((_a = heuristics.peers) === null || _a === void 0 ? void 0 : _a.length) {
                for (const peer of heuristics.peers) {
                    if (!nodes.includes(pr.name)) {
                        nodes.push(pr.name);
                    }
                    if (!nodes.includes(peer)) {
                        nodes.push(peer);
                    }
                    // only add edges that won't cause cycles
                    if (!indirectEdges.find((e) => e[0] === peer && e[1] === pr.name)) {
                        edges.push([pr.name, peer]);
                        indirectEdges.push([pr.name, peer]);
                    }
                    // track edges from indirect parents
                    edges.forEach((e) => {
                        if (e[1] === pr.name) {
                            indirectEdges.push([e[0], peer]);
                        }
                    });
                }
            }
        }
        // perform topological search with defined nodes and edges
        const order = toposort_1.default.array(nodes, edges);
        // split the requirements in those with peers (always first) and those without peers (always second)
        const upper = packageRequirements.filter((pr) => nodes.includes(pr.name));
        const lower = packageRequirements.filter((pr) => !nodes.includes(pr.name));
        // sorting of package requirements with peers by topological order
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
            // mean size
            if (heuristics1.meanSize !== heuristics2.meanSize) {
                return heuristics1.meanSize - heuristics2.meanSize;
            }
            // direct dependencies
            if (heuristics1.isDirectDependency && !heuristics2.isDirectDependency) {
                return 1;
            }
            else if (!heuristics1.isDirectDependency && heuristics2.isDirectDependency) {
                return -1;
            }
            // version range
            const versionRange1 = heuristics1.versionRange;
            const versionRange2 = heuristics2.versionRange;
            if (versionRange1.type === versionRange2.type) {
                if (versionRange1.value !== versionRange2.value) {
                    return versionRange1.value - versionRange2.value;
                }
            }
            else if (heuristics1.versionRange.type.endsWith('major') || heuristics2.versionRange.type.endsWith('patch')) {
                return 1;
            }
            else if (heuristics1.versionRange.type.endsWith('patch') || heuristics2.versionRange.type.endsWith('minor')) {
                return -1;
            }
            // conflict potential
            if (heuristics1.conflictPotential > heuristics2.conflictPotential) {
                return 1;
            }
            else if (heuristics1.conflictPotential < heuristics2.conflictPotential) {
                return -1;
            }
            return 0;
        });
        return [...upper, ...lower];
    }
    /**
     * get range between versions with type (major, minor, patch) and value (versions of type between them)
     * @param versions versions to get maximum range of
     * @private
     */
    getRangeBetweenVersions(versions) {
        // get highest and lowest versions that are reasonable
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
    /**
     * get pinned versions declared in command line parameter or package.json
     * @param params command line parameters including packages to install
     * @param dependencies dependencies specified in package.json
     * @private
     */
    getPinnedVersions(params, dependencies) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const pinnedVersions = {};
            // in case of install command, retrieve package names and versions from parameters
            const command = params.shift();
            if (command === 'i' || command === 'install') {
                if (params.length) {
                    // get versions from params
                    for (const param of params) {
                        if (typeof param === 'number') {
                            continue;
                        }
                        // either take version from parameter or from registry client and add it to pinned versions
                        const paramSplit = param.split(/(?<!^)@/);
                        const name = paramSplit.shift();
                        if (!paramSplit.length) {
                            const versions = (yield this.client.getAllVersionsFromRegistry(name)).versions.sort(compare_versions_1.compareVersions).reverse();
                            pinnedVersions[name] = versions[0];
                        }
                        else {
                            pinnedVersions[name] = paramSplit.shift();
                        }
                    }
                    return pinnedVersions;
                }
            }
            // if pinVersions option is set, add versions from package.json to pinned versions
            if (this.pinVersions) {
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