import * as fs from 'fs/promises';
import * as path from 'path';
import {
  findFiles,
  loadSpec,
  saveSpec,
  countPaths,
  mergeOpenAPISpecs,
  OpenAPISpec,
} from '../merger';

describe('merger', () => {
  const fixturesDir = path.resolve(__dirname, '../../test-fixtures');
  const tempDir = path.resolve(__dirname, '../../temp-test');

  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('findFiles', () => {
    it('should find files with glob patterns', async () => {
      const files = await findFiles(`${fixturesDir}/*.yaml`);
      expect(files).toHaveLength(3); // products-api.yaml, conflict1.yaml, conflict2.yaml
      expect(files.some((f) => f.includes('products-api.yaml'))).toBe(true);
    });

    it('should find files with multiple patterns', async () => {
      const files = await findFiles(`${fixturesDir}/*.json,${fixturesDir}/*.yaml`);
      expect(files).toHaveLength(5); // 2 json files + 3 yaml files (openapi.json, users-api.json, products-api.yaml, conflict1.yaml, conflict2.yaml)
      expect(files.some((f) => f.includes('users-api.json'))).toBe(true);
      expect(files.some((f) => f.includes('products-api.yaml'))).toBe(true);
    });

    it('should handle direct file paths', async () => {
      const files = await findFiles(`${fixturesDir}/users-api.json`);
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('users-api.json');
    });

    it('should return empty array for non-existent patterns', async () => {
      const files = await findFiles(`${fixturesDir}/*.nonexistent`);
      expect(files).toHaveLength(0);
    });
  });

  describe('loadSpec', () => {
    it('should load JSON files', async () => {
      const spec = await loadSpec(`${fixturesDir}/users-api.json`);
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.info.title).toBe('Users API');
      expect(spec.paths).toBeDefined();
    });

    it('should load YAML files', async () => {
      const spec = await loadSpec(`${fixturesDir}/products-api.yaml`);
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.info.title).toBe('Products API');
      expect(spec.paths).toBeDefined();
    });
  });

  describe('saveSpec', () => {
    it('should save spec as YAML', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              summary: 'Test endpoint',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const outputPath = path.join(tempDir, 'test-output.yaml');
      await saveSpec(spec, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('openapi: 3.0.0');
      expect(content).toContain('title: Test API');
      expect(content).toContain('/test:');
    });

    it('should create directories if they do not exist', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
      };

      const outputPath = path.join(tempDir, 'nested/dir/test.yaml');
      await saveSpec(spec, outputPath);

      const exists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('countPaths', () => {
    it('should count paths correctly', () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        paths: {
          '/users': {},
          '/users/{id}': {},
          '/products': {},
        },
      };

      expect(countPaths(spec)).toBe(3);
    });

    it('should return 0 for specs without paths', () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
      };

      expect(countPaths(spec)).toBe(0);
    });
  });

  describe('mergeOpenAPISpecs', () => {
    it('should merge multiple specs successfully', async () => {
      const outputPath = path.join(tempDir, 'merged.yaml');
      const result = await mergeOpenAPISpecs(
        `${fixturesDir}/users-api.json,${fixturesDir}/products-api.yaml`,
        outputPath,
      );

      expect(result.pathCountBefore).toBe(4); // 2 from users + 2 from products
      expect(result.pathCountAfter).toBe(4);
      expect(result.spec.paths).toHaveProperty('/users');
      expect(result.spec.paths).toHaveProperty('/products');

      const exists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should handle single file', async () => {
      const outputPath = path.join(tempDir, 'single.yaml');
      const result = await mergeOpenAPISpecs(`${fixturesDir}/users-api.json`, outputPath);

      expect(result.pathCountBefore).toBe(2);
      expect(result.pathCountAfter).toBe(2);
      expect(result.spec.paths).toHaveProperty('/users');
    });

    it('should throw error for non-existent files', async () => {
      const outputPath = path.join(tempDir, 'error.yaml');

      await expect(mergeOpenAPISpecs('non-existent-file.yaml', outputPath)).rejects.toThrow(
        'No files found matching patterns',
      );
    });
  });
});
