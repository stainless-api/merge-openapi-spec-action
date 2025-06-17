# Merge OpenAPI Specs Action

A GitHub Action to merge multiple OpenAPI specification files (JSON/YAML) into a single YAML file. Perfect for consolidating microservice APIs before uploading to [Stainless](https://stainless.com)!

## Features

- Supports both JSON and YAML OpenAPI specification files
- Handles glob patterns and direct file paths
- Merges using [Redocly CLI](https://redocly.com/docs/cli/) for proper OpenAPI spec handling
- Preserves tags and tag groups from source specs
- Verifies merge integrity by comparing path counts
- Outputs the merged file path and total path count

## Inputs

| Input         | Description                                                                  | Required | Default                 |
| ------------- | ---------------------------------------------------------------------------- | -------- | ----------------------- |
| `input_files` | Glob patterns or file paths of OpenAPI spec files to merge (comma-separated) | Yes      | -                       |
| `output_path` | Path where the merged file will be saved                                     | No       | `./merged-openapi.yaml` |

## Outputs

| Output        | Description                                       |
| ------------- | ------------------------------------------------- |
| `merged_file` | Path to the merged OpenAPI specification file     |
| `path_count`  | Total number of paths in the merged specification |

## How It Works

1. **Discovery**: The action finds files matching your input patterns (supports glob patterns and direct file paths)
2. **Merging**: Uses Redocly CLI's `join` command to properly merge OpenAPI specs while handling:
   - Component references
   - Tags and tag groups
   - Conflicting paths (last one wins)
3. **Conversion**: The final output is saved as a YAML file
4. **Verification**: Path counts are compared before and after merging
5. **Output**: The merged file path and total path count are available as action outputs

## Usage

If you have multiple OpenAPI spec files in a directory structure like:

```
api-specs/
├── users-api.json
├── products-api.yaml
├── orders-api.yml
└── payments/
    └── payments-api.json
```

This action will merge them all into a single file:

```yaml
- name: Merge OpenAPI specs
  uses: stainless-api/merge-openapi-specs-action@main
  with:
    input_files: 'api-specs/**/*.yaml,api-specs/**/*.json'
    output_path: ./merged-api.yaml
```

### Integration with Stainless SDK Build Action

```yaml
name: Build SDK from Merged Specs

on:
  push:
    branches: [main]
    paths:
      - 'api-specs/**'

jobs:
  merge-and-build-sdk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Merge all OpenAPI specs
        id: merge
        uses: stainless-api/merge-openapi-specs-action@main
        with:
          input_files: 'api-specs/**/*.yaml,api-specs/**/*.json'
          output_path: ./complete-api.yaml

      - name: Build SDKs
        uses: stainless-api/build-sdk-action@main
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          org: my-org
          project: my-project
          oas_path: ${{ steps.merge.outputs.merged_file }}
          config_path: ./stainless.yaml
```

### Complete SDK Pipeline Example

```yaml
name: Build and Publish SDKs

on:
  push:
    branches: [main]
    paths:
      - 'services/*/openapi.yaml'
      - 'services/*/openapi.json'

jobs:
  build-sdks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Step 1: Merge all microservice API specs
      - name: Merge microservice APIs
        id: merge-specs
        uses: stainless-api/merge-openapi-specs-action@main
        with:
          input_files: 'services/*/openapi.yaml,services/*/openapi.json'
          output_path: ./platform-api.yaml

      # Step 2: Validate the merged spec
      - name: Validate OpenAPI spec
        run: |
          npx @redocly/cli lint ${{ steps.merge-specs.outputs.merged_file }}

      # Step 3: Build SDKs with Stainless
      - name: Run merge build
        uses: stainless-api/build-sdk-action/merge@main
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          org: ${{ env.STAINLESS_ORG }}
          project: ${{ env.STAINLESS_PROJECT }}
          oas_path: ${{ env.OAS_PATH }}
          commit_message: ${{ env.COMMIT_MESSAGE }}
```

## License

Copyright Stainless 2025
