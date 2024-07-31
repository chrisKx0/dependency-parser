import { PackageDetails, Versions } from './interfaces';
export declare class RegistryClient {
    private details;
    private versions;
    private readonly path;
    constructor(details?: Record<string, PackageDetails>, versions?: Record<string, Versions>, path?: string);
    getPackageDetails(name: string, version: string): Promise<PackageDetails>;
    getAllVersionsFromRegistry(name: string): Promise<Versions>;
    readDataFromFiles(forceRegeneration?: boolean): void;
    writeDataToFiles(): void;
    private calculateMeanSize;
}
