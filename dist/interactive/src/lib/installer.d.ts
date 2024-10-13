import { PackageManager } from 'nx/src/utils/package-manager';
import { PackageRequirement, ResolvedPackage, Metrics } from './util';
/**
 * checks if an array consists of elements of type ResolvedPackage
 * @param array array of ResolvedPackage or PackageRequirement type
 */
export declare function areResolvedPackages(array: ResolvedPackage[] | PackageRequirement[]): array is ResolvedPackage[];
export declare class Installer {
    /**
     * creates a new metrics file in file system
     * @param metrics the metrics of the last evaluation run
     * @param packageJsonPath path to package.json file to retrieve repository name
     */
    createMetricsFile(metrics: Metrics, packageJsonPath: string): void;
    /**
     * runs installations via package managers and migration tools
     * @param packageManager the used package manager
     * @param path path in which installation should be run (where package.json lies)
     * @param nxVersion version to which Nx packages are updated to
     * @param ngPackages updated Angular packages with their versions
     * @param runMigrations if actual migrations should be performed
     */
    install(packageManager: string, path: string, nxVersion?: string, ngPackages?: ResolvedPackage[], runMigrations?: boolean): Promise<void>;
    /**
     * try to find eligible package manager through various means
     * @param packageJsonPath path to the package.json file
     * @param nxPath path to the nx.json file
     */
    getPackageManagers(packageJsonPath: string, nxPath: string): PackageManager[];
    /**
     * updates the package.json file with the resolved package versions
     * @param resolvedPackages resolved packages with their versions
     * @param path path to the package.json file
     */
    updatePackageJson(resolvedPackages: ResolvedPackage[], path: string): void;
    /**
     * checks whether an update tool is installed or not
     * @param tool name of the update tool (npm, pnpm, yarn, ng and nx)
     * @private
     */
    private isToolInstalled;
}
