import * as fs from 'fs';
import * as parseArgs from 'minimist';
import * as process from 'process';
import {satisfies} from 'compare-versions';

import {DependencyEntry, Parser} from './lib/parser';
import {PeerDependencies, RegistryClient} from './lib/registry-client';

interface PackageFile {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
    dependencyParser: Record<string, string>;
}

interface Conflicts {
    [packageName: string]: {
        neededVersion: string,
        installedVersion: string
    };
}

class DependencyParser {
    private parser: Parser;
    private client: RegistryClient;

    private readonly filename: string;

    constructor() {
        const argv = parseArgs(process.argv.slice(2));
        this.filename = argv.filename;
        this.parser = new Parser();
        this.client = new RegistryClient();
    }

    public async run() {
        if (!this.filename) {
            console.error('Please specify the path to a package.json file!');
            return;
        }


        const file: PackageFile = JSON.parse(fs.readFileSync(`${__dirname}/../files/${this.filename}`).toString());

        if (!file) {
            console.error('package.json does not exist in provided path!');
            return;
        }

        const packageEntries = file?.dependencyParser;
        const installedPackageEntries: Record<string, string> = {
            ...file.dependencies,
            ...file.devDependencies,
            ...file.peerDependencies,
        };

        if (!packageEntries) {
            console.warn('package.json does not have a "dependencyParser" entry.');
            return;
        }

        for (const [packageName, packageVersion] of Object.entries(packageEntries)) {
            const peerDependencies = await this.client.getPeerDependencies(packageName, packageVersion);

            const readme = await this.client.getReadme(packageName);
            const dependencyEntries = this.parser.parseMarkdown(readme, packageName);

            const conflicts: Conflicts = this.getConflicts(installedPackageEntries, peerDependencies);

            const humanReadableOutput = this.generateHumanReadableOutput(dependencyEntries, peerDependencies, conflicts, packageName, packageVersion);
            console.log(humanReadableOutput);
        }
    }

    private generateHumanReadableOutput(dependencyEntries: DependencyEntry[], peerDependencies: PeerDependencies, conflicts: Conflicts, packageName: string, packageVersion: string) {
        packageVersion = packageVersion === 'latest' ? peerDependencies.version : packageVersion;
        const matchingVersion = dependencyEntries.find((entry: DependencyEntry) => {
            return entry.versions.some((entryVersion) => satisfies(packageVersion, entryVersion));
        });

        const peerDependenciesString = Object.entries(peerDependencies.peerDependencies)
            .map(([name, version]) => `${name} in version ${version}`)
            .join(',\n');

        const dependencyMatrixString = Object.entries(matchingVersion.dependencies)
            .map(([name, version]) => `${name} in version ${version}`)
            .join(',\n');

        const conflictsString = Object.entries(conflicts)
                .map(([name, values]) => `${name} is already installed in version ${values.installedVersion} but needed in version ${values.neededVersion}`)
                .join(',\n');

        return `For version ${packageVersion} of package ${packageName}, ` +
            `the project must consist of the following technologies:\n\n${dependencyMatrixString}\n\n` +
            `The exact peer dependencies are as follows:\n\n${peerDependenciesString}\n\n` +
            `The following dependencies have conflicts with the currently installed packages:\n\n${conflictsString}\n\n`;
    }

    private getConflicts(installedPackageEntries: Record<string, string>, peerDependencies: PeerDependencies): Conflicts {
        const conflicts: Conflicts = {};
        for (const [peerDependencyName, peerDependencyVersion] of Object.entries(peerDependencies.peerDependencies)) {

            const installedVersion = Object.entries(installedPackageEntries).find(([name]) => name === peerDependencyName)?.[1];

            if (installedVersion && !satisfies(installedVersion, peerDependencyVersion)) {
                conflicts[peerDependencyName] = { installedVersion, neededVersion: peerDependencyVersion };
            }
        }
        return conflicts;
    }
}

new DependencyParser().run();
