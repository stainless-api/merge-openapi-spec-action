import * as glob from '@actions/glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { parseYaml, stringifyYaml } from '@redocly/openapi-core';

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

export async function findFiles(patterns: string): Promise<string[]> {
  const allFiles: string[] = [];
  const patternList = patterns.split(',').map((p) => p.trim());

  for (const pattern of patternList) {
    try {
      await fs.access(pattern);
      const stat = await fs.stat(pattern);
      if (stat.isFile()) {
        allFiles.push(pattern);
        continue;
      }
    } catch {
      // Not a direct file, try as glob
    }

    const globber = await glob.create(pattern);
    const files = await globber.glob();
    allFiles.push(...files);
  }

  return [...new Set(allFiles)];
}

export async function loadSpec(filePath: string): Promise<OpenAPISpec> {
  const content = await fs.readFile(filePath, 'utf-8');

  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  } else {
    return parseYaml(content) as OpenAPISpec;
  }
}

export async function saveSpec(spec: OpenAPISpec, filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const yamlContent = stringifyYaml(spec, { lineWidth: -1, noRefs: true });
  await fs.writeFile(filePath, yamlContent, 'utf-8');
}

function addBaseToPath(pathKey: string, baseUrl: string): string {
  const url = new URL(baseUrl);
  const domain = url.hostname;
  const [pathname, queryString] = pathKey.split('?');
  const params = new URLSearchParams(queryString || '');
  params.set('base', domain);
  return `${pathname}?${params.toString()}`;
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

async function processSpecForServers(
  spec: OpenAPISpec,
  strategy: ServerUrlStrategy
): Promise<OpenAPISpec> {
  const processed: OpenAPISpec = {
    ...spec,
    paths: {},
  };

  if (!spec.servers || spec.servers.length === 0) {
    if (spec.paths) {
      processed.paths = { ...spec.paths };
    }
    return processed;
  }

  // Uses first matching preserved URL if multiple match
  const preservedServerUrl = spec.servers.find(server =>
    strategy.preserve?.includes(server.url)
  )?.url;

  if (preservedServerUrl) {
    const servers = spec.servers;

    if (spec.paths) {
      for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
        const newPathKey = addBaseToPath(pathKey, preservedServerUrl);
        const newPathItem = { ...pathItem };

        for (const method of HTTP_METHODS) {
          if (newPathItem[method]) {
            newPathItem[method] = {
              ...newPathItem[method],
              ...(newPathItem[method].servers ? {} : { servers })
            };
          }
        }

        processed.paths![newPathKey] = newPathItem;
      }
    }

    delete processed.servers;
  } else {
    const hasGlobal = strategy.global &&
      spec.servers.some(server => server.url === strategy.global);

    if (!hasGlobal) {
      delete processed.servers;
    }

    if (spec.paths) {
      processed.paths = { ...spec.paths };
    }
  }

  return processed;
}

export async function mergeSpecs(
  files: string[],
  outputPath: string,
  serverStrategy?: ServerUrlStrategy
): Promise<void> {
  if (files.length === 0) {
    throw new Error('No files to merge');
  }

  if (files.length === 1) {
    // For single file, apply strategy and convert to YAML
    let spec = await loadSpec(files[0]);

    if (serverStrategy) {
      spec = await processSpecForServers(spec, serverStrategy);

      // Add global server if needed and not present
      if (serverStrategy.global && !spec.servers) {
        spec.servers = [{ url: serverStrategy.global }];
      }
    }

    await saveSpec(spec, outputPath);
    return;
  }

  // Prepare files for merging
  let filesToMerge = files;
  const tempDir = serverStrategy ? path.join(path.dirname(outputPath), '.temp-merge') : null;

  try {
    // Process specs if server strategy is provided
    if (serverStrategy) {
      await fs.mkdir(tempDir!, { recursive: true });
      filesToMerge = [];

      for (let i = 0; i < files.length; i++) {
        const spec = await loadSpec(files[i]);
        const processed = await processSpecForServers(spec, serverStrategy);

        // Save processed spec to temp file
        const tempFile = path.join(tempDir!, `temp-${i}.yaml`);
        await saveSpec(processed, tempFile);
        filesToMerge.push(tempFile);
      }
    }

    // Use redocly join to create merged JSON file
    const jsonPath = outputPath.replace(/\.ya?ml$/, '') + '.json';
    const jsonDir = path.dirname(jsonPath);
    await fs.mkdir(jsonDir, { recursive: true });

    const command = `npx @redocly/cli join ${filesToMerge.join(' ')} -o "${jsonPath}"`;

    // Redocly CLI outputs to stderr instead of files when NODE_ENV=test
    const env = { ...process.env };
    delete env.NODE_ENV;

    execSync(command, {
      cwd: process.cwd(),
      env: env,
    });

    // Load merged spec
    const mergedSpec = await loadSpec(jsonPath);

    // Apply global server if strategy specified and no servers present
    if (serverStrategy?.global && !mergedSpec.servers) {
      mergedSpec.servers = [{ url: serverStrategy.global }];
    }

    await saveSpec(mergedSpec, outputPath);

    // We keep the JSON file around for debugging
  } catch (error: any) {
    const stderr = error.stderr ? error.stderr.toString() : '';
    const stdout = error.stdout ? error.stdout.toString() : '';
    throw new Error(
      `Failed to merge files using redocly join.\nError: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`,
    );
  } finally {
    // Clean up temp directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export function countPaths(spec: OpenAPISpec): number {
  return Object.keys(spec.paths || {}).length;
}

export async function mergeOpenAPISpecs(
  inputPatterns: string,
  outputPath: string,
  serverStrategy?: ServerUrlStrategy,
): Promise<MergeResult> {
  // Find all matching files
  const files = await findFiles(inputPatterns);

  if (files.length === 0) {
    throw new Error(`No files found matching patterns: ${inputPatterns}`);
  }

  // Count paths before merge
  let pathCountBefore = 0;
  for (const file of files) {
    const spec = await loadSpec(file);
    pathCountBefore += countPaths(spec);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Merge specs using redocly with optional server strategy
  await mergeSpecs(files, outputPath, serverStrategy);

  // Load the merged spec to count paths and return
  const mergedSpec = await loadSpec(outputPath);
  if (!mergedSpec) {
    throw new Error(`Failed to load merged spec from ${outputPath}`);
  }
  const pathCountAfter = countPaths(mergedSpec);

  return {
    spec: mergedSpec,
    pathCountBefore,
    pathCountAfter,
  };
}
