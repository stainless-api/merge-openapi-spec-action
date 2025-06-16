# Merge OpenAPI Specs Action

A GitHub Action to merge multiple OpenAPI specification files (JSON/YAML) into a single YAML file. Perfect for consolidating microservice APIs before uploading to [Stainless](https://stainless.com)!

## Features

- Supports both JSON and YAML OpenAPI specification files
- Automatically converts JSON files to YAML before merging
- Verifies merge integrity by comparing path counts
- Outputs the merged file path and total path count

## Inputs

| Input             | Description                                      | Required | Default               |
| ----------------- | ------------------------------------------------ | -------- | --------------------- |
| `input-dir`       | Directory containing OpenAPI spec files to merge | No       | `./input`             |
| `output-dir`      | Directory where the merged file will be saved    | No       | `./output`            |
| `output-filename` | Name of the merged output file                   | No       | `merged-openapi.yaml` |

## Outputs

| Output        | Description                                       |
| ------------- | ------------------------------------------------- |
| `merged-file` | Path to the merged OpenAPI specification file     |
| `path-count`  | Total number of paths in the merged specification |

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
    input-dir: ./api-specs
    output-dir: ./merged
    output-filename: api.yaml
```

### Integration with Stainless Upload Action

```yaml
name: Upload Merged API to Stainless

on:
  push:
    branches: [main]
    paths:
      - "api-specs/**"

jobs:
  merge-and-upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Merge all OpenAPI specs
        id: merge
        uses: stainless-api/merge-openapi-specs-action@v1
        with:
          input-dir: ./api-specs
          output-filename: merged-api.yaml

      - name: Upload to Stainless
        uses: stainless-api/upload-openapi-spec-action@v1
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          input_path: ${{ steps.merge.outputs.merged-file }}
          config_path: ./stainless.yml
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
          input-dir: ./api-specs
          output-dir: ./build
          output-filename: complete-api.yaml

      - name: Build SDKs
        uses: stainless-api/build-sdk-action@v1
        with:
          spec_path: ${{ steps.merge.outputs.merged-file }}
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          config_path: ./stainless.yml
          languages: typescript,python,go
```

### Complete CI/CD Pipeline Example

```yaml
name: API Documentation Pipeline

on:
  push:
    branches: [main]
    paths:
      - "services/*/openapi.yaml"
      - "services/*/openapi.json"

jobs:
  process-api-specs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Step 1: Merge all service API specs
      - name: Merge microservice APIs
        id: merge
        uses: stainless-api/merge-openapi-specs-action@v1
        with:
          input-dir: ./services
          output-dir: ./dist
          output-filename: platform-api.yaml

      # Step 2: Validate the merged spec
      - name: Validate OpenAPI spec
        run: |
          npx @redocly/cli lint ${{ steps.merge.outputs.merged-file }}

      # Step 3: Upload to Stainless
      - name: Upload to Stainless
        uses: stainless-api/upload-openapi-spec-action@v1
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          input_path: ${{ steps.merge.outputs.merged-file }}
          config_path: ./stainless.yml

      # Step 4: Generate documentation
      - name: Generate API docs
        run: |
          npx @redocly/cli build-docs ${{ steps.merge.outputs.merged-file }} \
            -o ./docs/api.html

      # Step 5: Deploy docs (example with GitHub Pages)
      - name: Deploy documentation
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs
```

## Requirements

This action automatically installs the following dependencies:

- Node.js 20
- @redocly/cli
- jq
- yq

## License

Copyright Stainless 2025
