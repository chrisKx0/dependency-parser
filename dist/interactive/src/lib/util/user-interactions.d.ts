import { PackageManager } from 'nx/src/utils/package-manager';
import { PackageRequirement, ResolvedPackage, Severity } from './interfaces';
/**
 * prompts a question on command line and awaits user action
 * @param key key of the question to show
 * @param choices possible (dynamic) choices the user can choose from (optional)
 * @param defaults default values of the provided choices (optional)
 */
export declare function promptQuestion<T extends PackageManager | number | boolean | string[]>(key: string, choices?: string[], defaults?: string[]): Promise<T>;
/**
 * creates a formatted console output before evaluation with the open requirements
 * @param openRequirements open requirements that are taken into account in evaluation
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
export declare function createOpenRequirementOutput(openRequirements: PackageRequirement[], isInteractive?: boolean): void;
/**
 * creates a formatted console output with the resolved packages and their versions after evaluation
 * @param resolvedPackages resolved packages that should be shown
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
export declare function createResolvedPackageOutput(resolvedPackages: ResolvedPackage[], isInteractive?: boolean): void;
/**
 * creates a message on the command line with a severity
 * @param keyOrMessage key of the message to show or the message itself (for dynamic messages)
 * @param severity message severity (info, success, warning or error)
 * @param isInteractive if the output is for the CLI in interactive mode or the GitHub action in unattended mode
 */
export declare function createMessage(keyOrMessage: string, severity?: Severity): void;
