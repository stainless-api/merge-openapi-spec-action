export interface OpenAPISpec {
    openapi: string;
    paths?: Record<string, any>;
    servers?: Server[];
    [key: string]: any;
}
export interface Server {
    url: string;
    description?: string;
    variables?: Record<string, any>;
}
export interface ServerUrlStrategy {
    global?: string;
    preserve?: string[];
}
export interface MergeResult {
    spec: OpenAPISpec;
    pathCountBefore: number;
    pathCountAfter: number;
}
export declare function findFiles(patterns: string): Promise<string[]>;
export declare function loadSpec(filePath: string): Promise<OpenAPISpec>;
export declare function saveSpec(spec: OpenAPISpec, filePath: string): Promise<void>;
export declare function mergeSpecs(files: string[], outputPath: string, serverStrategy?: ServerUrlStrategy): Promise<void>;
export declare function countPaths(spec: OpenAPISpec): number;
export declare function mergeOpenAPISpecs(inputPatterns: string, outputPath: string, serverStrategy?: ServerUrlStrategy): Promise<MergeResult>;
