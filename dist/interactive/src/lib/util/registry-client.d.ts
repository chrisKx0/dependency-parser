import { PackageDetails, Versions } from './interfaces';
export declare class RegistryClient {
    private readonly path;
    private details;
    private versions;
    constructor(path?: string);
    getPackageDetails(name: string, version: string): Promise<PackageDetails>;
    getAllVersionsFromRegistry(name: string): Promise<Versions>;
    readDataFromFiles(): void;
    writeDataToFiles(): void;
    private calculateMeanSize;
}
