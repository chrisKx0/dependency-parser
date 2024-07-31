import { PackageRequirement, ResolvedPackage } from './interfaces';
import { PackageManager } from 'nx/src/utils/package-manager';
export declare enum Severity {
    INFO = "info",
    SUCCESS = "success",
    WARNING = "warning",
    ERROR = "error"
}
export declare function promptQuestion<T extends PackageManager | number | boolean | string[]>(key: string, choices?: string[], defaults?: string[]): Promise<T>;
export declare function createOpenRequirementOutput(openRequirements: PackageRequirement[]): void;
export declare function createResolvedPackageOutput(resolvedPackages: ResolvedPackage[]): void;
export declare function createMessage(keyOrMessage: string, severity?: Severity): void;
