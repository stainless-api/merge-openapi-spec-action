# Merge OpenAPI Specs Action

A GitHub Action to merge multiple OpenAPI specification files (JSON/YAML) into a single YAML file. Perfect for consolidating microservice APIs before uploading to [Stainless](https://stainless.com)!

## Features

- Supports both JSON and YAML OpenAPI specification files
- Automatically converts JSON files to YAML before merging
- Verifies merge integrity by comparing path counts
- Outputs the merged file path and total path count

## Inputs

| Input         | Description                                                                           | Required | Default                 |
| ------------- | ------------------------------------------------------------------------------------- | -------- | ----------------------- |
| `input_files` | Glob patterns or file paths of OpenAPI spec files to merge (comma-separated)         | Yes      | -                       |
| `output_path` | Path where the merged file will be saved                                              | No       | `./merged-openapi.yaml` |

## Outputs

| Output        | Description                                       |
| ------------- | ------------------------------------------------- |
| `merged_file` | Path to the merged OpenAPI specification file     |
| `path_count`  | Total number of paths in the merged specification |

## How It Works

1. **Discovery**: The action recursively searches the input directory for all `.json`, `.yaml`, and `.yml` files
2. **Conversion**: JSON files are automatically converted to YAML format
3. **Merging**: All specs are merged using Redocly's `join` command
4. **Verification**: Path counts are compared before and after merging to detect any overwrites
5. **Output**: The merged file is saved to the specified location and the path is available as an output

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
  uses: stainless-api/merge-openapi-specs-action@v1
  with:
    input_files: "api-specs/**/*.yaml,api-specs/**/*.json"
    output_path: ./merged/api.yaml
```

### Integration with Stainless SDK Build Action

```yaml
name: Build SDK from Merged Specs

on:
  push:
    branches: [main]
    paths:
      - "api-specs/**"

jobs:
  merge-and-build-sdk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Merge all OpenAPI specs
        id: merge
        uses: stainless-api/merge-openapi-specs-action@v1
        with:
          input_files: "api-specs/**/*.yaml,api-specs/**/*.json"
          output_path: ./build/complete-api.yaml

      - name: Build SDKs
        uses: stainless-api/build-sdk-action@v1
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
      - "services/*/openapi.yaml"
      - "services/*/openapi.json"

jobs:
  build-sdks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Step 1: Merge all microservice API specs
      - name: Merge microservice APIs
        id: merge
        uses: stainless-api/merge-openapi-specs-action@v1
        with:
          input_files: "services/*/openapi.yaml,services/*/openapi.json"
          output_path: ./build/platform-api.yaml

      # Step 2: Validate the merged spec
      - name: Validate OpenAPI spec
        run: |
          npx @redocly/cli lint ${{ steps.merge.outputs.merged_file }}

      # Step 3: Build SDKs with Stainless
      - name: Build SDKs
        uses: stainless-api/build-sdk-action@v1
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          org: my-org
          project: my-project
          oas_path: ${{ steps.merge.outputs.merged_file }}
          config_path: ./stainless.yaml

      # Step 4: Upload artifacts (optional)
      - name: Upload SDK artifacts
        uses: actions/upload-artifact@v4
        with:
          name: generated-sdks
          path: |
            ./sdk-typescript/
            ./sdk-python/
            ./sdk-go/
            ./sdk-java/
```

## Requirements

This action automatically installs the following dependencies:

- Node.js 20
- @redocly/cli
- jq
- yq

## License

Copyright Stainless 2025
