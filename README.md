> Archived: use https://github.com/stainless-api/upload-openapi-spec-action/blob/main/prepare/combine/action.yml instead!

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

| Input                 | Description                                                                  | Required | Default                 |
| --------------------- | ---------------------------------------------------------------------------- | -------- | ----------------------- |
| `input_files`         | Glob patterns or file paths of OpenAPI spec files to merge (comma-separated) | Yes      | -                       |
| `output_path`         | Path where the merged file will be saved                                     | No       | `./merged-openapi.yaml` |
| `server_url_strategy` | YAML configuration for handling server URLs during merge (see below)         | No       | -                       |

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

## Server URL Strategy

Control how different server URLs are handled during merge with the optional `server_url_strategy` input:

```yaml
- uses: stainless-api/merge-openapi-spec-action@main
  with:
    input_files: 'services/*/openapi.yaml'
    output_path: ./merged-api.yaml
    server_url_strategy: |
      global: https://api.stainless.com        # Default server for merged spec
      preserve:                                 # Keep these servers at operation level
        - https://api.special.stainless.com
        - https://api.another.stainless.com
```

Preserved server URLs have their paths disambiguated with `?base=domain` to prevent collisions (e.g., `/search` becomes `/search?base=api.special.stainless.com`).

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
  uses: stainless-api/merge-openapi-spec-action@main
  with:
    input_files: 'api-specs/**/*.yaml,api-specs/**/*.json'
    output_path: ./merged-api.yaml
```

### Integration with Stainless Spec Upload Action

Combine this action with [stainless-api/upload-openapi-spec-action](https://github.com/stainless-api/upload-openapi-spec-action) to merge multiple specs and automatically build SDKs with preview and merge workflows:

```yaml
name: Build SDKs from Merged Specs

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]
    paths:
      - 'services/*/openapi.yaml'
      - 'services/*/openapi.json'

env:
  STAINLESS_ORG: my-org
  STAINLESS_PROJECT: my-project

jobs:
  preview:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Merge all microservice API specs
        id: merge-specs
        uses: stainless-api/merge-openapi-spec-action@main
        with:
          input_files: 'services/**/*.yaml,services/**/*.json'
          output_path: ./platform-api.yaml

      - name: Validate OpenAPI spec
        run: |
          npx @redocly/cli lint ${{ steps.merge-specs.outputs.merged_file }}

      - name: Preview SDK changes
        uses: stainless-api/upload-openapi-spec-action/preview@v1
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          org: ${{ env.STAINLESS_ORG }}
          project: ${{ env.STAINLESS_PROJECT }}
          oas_path: ${{ steps.merge-specs.outputs.merged_file }}

  merge:
    if: github.event.action == 'closed' && github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Merge all microservice API specs
        id: merge-specs
        uses: stainless-api/merge-openapi-spec-action@main
        with:
          input_files: 'services/**/*.yaml,services/**/*.json'
          output_path: ./platform-api.yaml

      - name: Validate OpenAPI spec
        run: |
          npx @redocly/cli lint ${{ steps.merge-specs.outputs.merged_file }}

      - name: Merge SDK changes
        uses: stainless-api/upload-openapi-spec-action/merge@v1
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          org: ${{ env.STAINLESS_ORG }}
          project: ${{ env.STAINLESS_PROJECT }}
          oas_path: ${{ steps.merge-specs.outputs.merged_file }}
```

## License

Copyright Stainless 2025
