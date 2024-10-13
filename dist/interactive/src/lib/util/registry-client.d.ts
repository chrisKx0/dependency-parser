import { PackageDetails, Versions } from './interfaces';
export declare class RegistryClient {
    private readonly path;
    private details;
    private versions;
    constructor(path?: string);
    /**
     * retrieves package details from npm registry for a specific package version (with cache)
     * @param name name of the package
     * @param version version of the package
     */
    getPackageDetails(name: string, version: string): Promise<PackageDetails>;
    /**
     * retrieves all versions and sizes of a package from npm registry (with cache)
     * @param name name of the package
     */
    getAllVersionsFromRegistry(name: string): Promise<Versions>;
    /**
     * loads a saved cache from file system
     */
    readDataFromFiles(): void;
    /**
     * saves the cache to file system
     */
    writeDataToFiles(): void;
}
