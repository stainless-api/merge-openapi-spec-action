import * as fs from 'fs/promises';
import * as path from 'path';
import {
  findFiles,
  loadSpec,
  saveSpec,
  countPaths,
  mergeOpenAPISpecs,
  OpenAPISpec,
  ServerUrlStrategy,
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
      expect(files).toHaveLength(7); // products-api.yaml, conflict1.yaml, conflict2.yaml, main-api.yaml, special-api.yaml, local-api.yaml, another-api.yaml
      expect(files.some((f) => f.includes('products-api.yaml'))).toBe(true);
    });

    it('should find files with multiple patterns', async () => {
      const files = await findFiles(`${fixturesDir}/*.json,${fixturesDir}/*.yaml`);
      expect(files).toHaveLength(9); // 2 json files + 7 yaml files
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

  describe('Server URL Strategy', () => {
    it('should apply global server URL', async () => {
      const outputPath = path.join(tempDir, 'with-global-server.yaml');
      const strategy: ServerUrlStrategy = {
        global: 'https://api.stainless.com',
      };

      const result = await mergeOpenAPISpecs(
        `${fixturesDir}/main-api.yaml,${fixturesDir}/local-api.yaml`,
        outputPath,
        strategy,
      );

      expect(result.spec.servers).toBeDefined();
      expect(result.spec.servers![0].url).toBe('https://api.stainless.com');
    });

    it('should preserve server URLs at operation level with path disambiguation', async () => {
      const outputPath = path.join(tempDir, 'with-preserved-servers.yaml');
      const strategy: ServerUrlStrategy = {
        global: 'https://api.stainless.com',
        preserve: ['https://api.special.stainless.com'],
      };

      const result = await mergeOpenAPISpecs(
        `${fixturesDir}/main-api.yaml,${fixturesDir}/special-api.yaml`,
        outputPath,
        strategy,
      );

      // Global server should be set
      expect(result.spec.servers).toBeDefined();
      expect(result.spec.servers![0].url).toBe('https://api.stainless.com');

      // Special API endpoints should have servers at operation level with ?base= added to paths (just domain)
      const specialFeature =
        result.spec.paths?.['/special/feature?base=api.special.stainless.com']?.get;
      expect(specialFeature?.servers).toBeDefined();
      expect(specialFeature?.servers[0].url).toBe('https://api.special.stainless.com');

      const specialData = result.spec.paths?.['/special/data?base=api.special.stainless.com']?.post;
      expect(specialData?.servers).toBeDefined();
      expect(specialData?.servers[0].url).toBe('https://api.special.stainless.com');

      // Main API endpoints should remain unchanged (no ?base=)
      const status = result.spec.paths?.['/status']?.get;
      expect(status?.servers).toBeUndefined();
    });

    it('should remove non-global servers when not preserved', async () => {
      const outputPath = path.join(tempDir, 'with-removed-servers.yaml');
      const strategy: ServerUrlStrategy = {
        global: 'https://api.stainless.com',
        preserve: ['https://api.special.stainless.com'],
      };

      const result = await mergeOpenAPISpecs(
        `${fixturesDir}/main-api.yaml,${fixturesDir}/special-api.yaml,${fixturesDir}/local-api.yaml`,
        outputPath,
        strategy,
      );

      // Global server should be set
      expect(result.spec.servers).toBeDefined();
      expect(result.spec.servers![0].url).toBe('https://api.stainless.com');

      // Local API endpoints should not have operation-level servers (localhost URLs removed)
      const localTest = result.spec.paths?.['/local/test']?.get;
      expect(localTest?.servers).toBeUndefined();
    });

    it('should handle single file with server strategy', async () => {
      const outputPath = path.join(tempDir, 'single-with-strategy.yaml');
      const strategy: ServerUrlStrategy = {
        global: 'https://api.production.com',
      };

      const result = await mergeOpenAPISpecs(`${fixturesDir}/local-api.yaml`, outputPath, strategy);

      // Should replace local servers with global
      expect(result.spec.servers).toBeDefined();
      expect(result.spec.servers![0].url).toBe('https://api.production.com');
    });

    it('should preserve multiple server URLs from same spec', async () => {
      const outputPath = path.join(tempDir, 'preserve-multiple.yaml');
      const strategy: ServerUrlStrategy = {
        global: 'https://api.stainless.com',
        preserve: [
          'https://api.special.stainless.com',
          'https://api.special-staging.stainless.com',
        ],
      };

      const result = await mergeOpenAPISpecs(
        `${fixturesDir}/main-api.yaml,${fixturesDir}/special-api.yaml`,
        outputPath,
        strategy,
      );

      // Special API endpoints should have both servers at operation level
      // Path should use the first preserved server URL's domain for disambiguation
      const specialFeature =
        result.spec.paths?.['/special/feature?base=api.special.stainless.com']?.get;
      expect(specialFeature?.servers).toBeDefined();
      expect(specialFeature?.servers).toHaveLength(2);
      expect(specialFeature?.servers[0].url).toBe('https://api.special.stainless.com');
      expect(specialFeature?.servers[1].url).toBe('https://api.special-staging.stainless.com');
    });

    it('should handle path collisions by adding ?base= disambiguation', async () => {
      const outputPath = path.join(tempDir, 'with-path-collisions.yaml');
      const strategy: ServerUrlStrategy = {
        global: 'https://api.stainless.com',
        preserve: ['https://api.another.stainless.com'],
      };

      const result = await mergeOpenAPISpecs(
        `${fixturesDir}/main-api.yaml,${fixturesDir}/another-api.yaml`,
        outputPath,
        strategy,
      );

      // Both APIs have /search endpoint - they should not collide

      // Main API's /search should be at /search (no ?base= needed)
      const mainSearch = result.spec.paths?.['/search']?.get;
      expect(mainSearch).toBeDefined();
      expect(mainSearch?.summary).toBe('Search in main API');
      expect(mainSearch?.servers).toBeUndefined(); // Uses global server

      // Another API's /search should be at /search?base=api.another.stainless.com
      const anotherSearch = result.spec.paths?.['/search?base=api.another.stainless.com']?.get;
      expect(anotherSearch).toBeDefined();
      expect(anotherSearch?.summary).toBe('Search in another service');
      expect(anotherSearch?.servers).toBeDefined();
      expect(anotherSearch?.servers[0].url).toBe('https://api.another.stainless.com');

      // Verify we have both endpoints and no collision occurred
      expect(Object.keys(result.spec.paths || {})).toContain('/search');
      expect(Object.keys(result.spec.paths || {})).toContain(
        '/search?base=api.another.stainless.com',
      );
    });

    it('should handle paths with existing query parameters', async () => {
      // Create spec with path that already has query params
      const specWithQuery: OpenAPISpec = {
        openapi: '3.0.0',
        servers: [{ url: 'https://api.test.com' }],
        paths: {
          '/search?version=v2': {
            get: {
              summary: 'Search with version param',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tempFile = path.join(tempDir, 'spec-with-query.yaml');
      await saveSpec(specWithQuery, tempFile);

      const outputPath = path.join(tempDir, 'merged-with-query.yaml');
      const strategy: ServerUrlStrategy = {
        global: 'https://api.main.com',
        preserve: ['https://api.test.com'],
      };

      const result = await mergeOpenAPISpecs(tempFile, outputPath, strategy);

      // Should have both version and base parameters
      const searchPath = Object.keys(result.spec.paths || {}).find((p) => p.includes('/search'));
      expect(searchPath).toBe('/search?version=v2&base=api.test.com');
    });

    it('should handle URLs with ports correctly', async () => {
      // Create spec with port in URL
      const specWithPort: OpenAPISpec = {
        openapi: '3.0.0',
        servers: [{ url: 'https://api.test.com:8443' }],
        paths: {
          '/endpoint': {
            get: {
              summary: 'Test endpoint',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const tempFile = path.join(tempDir, 'spec-with-port.yaml');
      await saveSpec(specWithPort, tempFile);

      const outputPath = path.join(tempDir, 'merged-with-port.yaml');
      const strategy: ServerUrlStrategy = {
        global: 'https://api.production.com',
        preserve: ['https://api.test.com:8443'],
      };

      const result = await mergeOpenAPISpecs(tempFile, outputPath, strategy);

      // Port should be ignored in domain extraction, only hostname used
      const endpointPath = Object.keys(result.spec.paths || {}).find((p) =>
        p.includes('/endpoint'),
      );
      expect(endpointPath).toBe('/endpoint?base=api.test.com');

      const endpoint = result.spec.paths?.[endpointPath!];
      expect(endpoint?.get?.servers?.[0]?.url).toBe('https://api.test.com:8443');
    });
  });
});
