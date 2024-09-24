import { PackageManager } from 'nx/src/utils/package-manager';
import { PackageRequirement, ResolvedPackage } from './util';
export declare function areResolvedPackages(array: ResolvedPackage[] | PackageRequirement[]): array is ResolvedPackage[];
export declare class Installer {
    install(packageManager: string, path: string, nxVersion?: string, ngPackages?: ResolvedPackage[], runMigrations?: boolean): Promise<void>;
    getPackageManagers(packageJsonPath: string, nxPath: string): PackageManager[];
    updatePackageJson(resolvedPackages: ResolvedPackage[], path: string): void;
    private isToolInstalled;
}
