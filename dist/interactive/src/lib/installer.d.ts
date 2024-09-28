import { PackageManager } from 'nx/src/utils/package-manager';
import { PackageRequirement, ResolvedPackage, Metrics } from './util';
export declare function areResolvedPackages(array: ResolvedPackage[] | PackageRequirement[]): array is ResolvedPackage[];
export declare class Installer {
    createMetricsFile(metrics: Metrics): void;
    install(packageManager: string, path: string, nxVersion?: string, ngPackages?: ResolvedPackage[], runMigrations?: boolean): Promise<void>;
    getPackageManagers(packageJsonPath: string, nxPath: string): PackageManager[];
    updatePackageJson(resolvedPackages: ResolvedPackage[], path: string): void;
    private isToolInstalled;
}
