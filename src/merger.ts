import * as glob from '@actions/glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

export interface OpenAPISpec {
  openapi: string;
  paths?: Record<string, any>;
  [key: string]: any;
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
    // Check if it's a direct file path
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

    // Use glob to find files
    const globber = await glob.create(pattern);
    const files = await globber.glob();
    allFiles.push(...files);
  }

  // Remove duplicates
  return [...new Set(allFiles)];
}

export async function loadSpec(filePath: string): Promise<OpenAPISpec> {
  const content = await fs.readFile(filePath, 'utf-8');

  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  } else {
    return yaml.load(content) as OpenAPISpec;
  }
}

export async function saveSpec(spec: OpenAPISpec, filePath: string): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Save as YAML
  const yamlContent = yaml.dump(spec, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: true,
  });

  await fs.writeFile(filePath, yamlContent, 'utf-8');
}

export async function mergeSpecs(files: string[], outputPath: string): Promise<void> {
  if (files.length === 0) {
    throw new Error('No files to merge');
  }

  if (files.length === 1) {
    // For single file, convert to YAML to ensure consistent output
    const spec = await loadSpec(files[0]);
    await saveSpec(spec, outputPath);
    return;
  }

  // Step 1: Use redocly join to create merged JSON file
  const jsonPath = outputPath.replace(/\.ya?ml$/, '') + '.json';

  // Ensure the directory exists for the JSON file
  const jsonDir = path.dirname(jsonPath);
  await fs.mkdir(jsonDir, { recursive: true });

  const command = `npx @redocly/cli join ${files.join(' ')} -o "${jsonPath}"`;

  try {
    // Redocly CLI outputs to stderr instead of files when NODE_ENV=test
    // We need to override this for the redocly command to work properly
    const env = { ...process.env };
    delete env.NODE_ENV;

    execSync(command, {
      cwd: process.cwd(),
      env: env,
    });

    // Step 2: Convert JSON to YAML
    const spec = await loadSpec(jsonPath);
    await saveSpec(spec, outputPath);

    // We keep the JSON file around for debugging
  } catch (error: any) {
    const stderr = error.stderr ? error.stderr.toString() : '';
    const stdout = error.stdout ? error.stdout.toString() : '';
    throw new Error(
      `Failed to merge files using redocly join. Command: ${command}\nError: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`,
    );
  }
}

export function countPaths(spec: OpenAPISpec): number {
  return Object.keys(spec.paths || {}).length;
}

export async function mergeOpenAPISpecs(
  inputPatterns: string,
  outputPath: string,
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

  // Merge specs using redocly
  await mergeSpecs(files, outputPath);

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
