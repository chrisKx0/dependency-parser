interface DependencyEntryValue {
    [dependencyName: string]: string;
}
export interface DependencyEntry {
    versions: string[];
    dependencies: DependencyEntryValue;
}
export interface DependencyInfo {
    name: string;
    version: string;
}
export declare class Parser {
    /**
     * Parse UCS2 encoded console output file.
     * Can be created by running Powershell Out-Dir command with "npm/pnpm install".
     * @param output Content of the output file.
     * @deprecated
     */
    parseConsoleOutput(output: string): DependencyInfo[];
    /**
     * Parses a markdown file for dependency matrices and returns a list of dependency entries.
     * @param markdown The string of the markdown file.
     * @param packageName Name of the package to find dependencies for.
     * @deprecated
     */
    parseMarkdown(markdown: string, packageName: string): DependencyEntry[];
}
export {};
