#!/bin/bash

set -euo pipefail

# Get input parameters
INPUT_DIR="${1:-./input}"
OUTPUT_DIR="${2:-./output}"
OUTPUT_FILENAME="${3:-merged-openapi.yaml}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create necessary directories
echo -e "${BLUE}Creating directories...${NC}"
mkdir -p "$OUTPUT_DIR"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Function to count paths in a spec file
count_paths() {
    local file="$1"
    local count=0
    
    if [[ $file == *.json ]]; then
        count=$(jq -r '.paths | length' "$file" 2>/dev/null || echo "0")
    else
        count=$(yq eval '.paths | length' "$file" 2>/dev/null || echo "0")
    fi
    
    echo "$count"
}

# Function to convert file to YAML
convert_to_yaml() {
    local input_file="$1"
    local output_file="$2"
    
    if [[ $input_file == *.json ]]; then
        echo -e "${YELLOW}Converting $input_file to YAML...${NC}"
        redocly bundle "$input_file" -o "$output_file" --format=yaml --ext yaml || {
            echo -e "${RED}Failed to convert $input_file${NC}"
            return 1
        }
    else
        # Already YAML, just copy
        cp "$input_file" "$output_file"
    fi
    
    return 0
}

# Find all OpenAPI spec files
echo -e "${BLUE}Finding OpenAPI spec files in $INPUT_DIR...${NC}"
spec_files=()
while IFS= read -r -d '' file; do
    spec_files+=("$file")
done < <(find "$INPUT_DIR" -type f \( -name "*.json" -o -name "*.yaml" -o -name "*.yml" \) -print0)

if [ ${#spec_files[@]} -eq 0 ]; then
    echo -e "${RED}No OpenAPI spec files found in $INPUT_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}Found ${#spec_files[@]} spec files${NC}"

# Convert all files to YAML and count paths
total_paths_before=0
yaml_files=()

for spec_file in "${spec_files[@]}"; do
    basename_no_ext=$(basename "${spec_file%.*}")
    yaml_file="$TEMP_DIR/${basename_no_ext}.yaml"
    
    if convert_to_yaml "$spec_file" "$yaml_file"; then
        path_count=$(count_paths "$yaml_file")
        echo -e "${BLUE}  $(basename "$spec_file"): $path_count paths${NC}"
        total_paths_before=$((total_paths_before + path_count))
        yaml_files+=("$yaml_file")
    fi
done

echo -e "${GREEN}Total paths before merge: $total_paths_before${NC}"

# Merge files using redocly
output_file="$OUTPUT_DIR/$OUTPUT_FILENAME"
echo -e "${BLUE}Merging ${#yaml_files[@]} files...${NC}"

if [ ${#yaml_files[@]} -eq 1 ]; then
    # Only one file, just copy it
    cp "${yaml_files[0]}" "$output_file"
else
    # Merge multiple files
    redocly join "${yaml_files[@]}" -o "$output_file" || {
        echo -e "${RED}Failed to merge files${NC}"
        exit 1
    }
fi

# Verify the merge
total_paths_after=$(count_paths "$output_file")
echo -e "${GREEN}Total paths after merge: $total_paths_after${NC}"

if [ "$total_paths_after" -ne "$total_paths_before" ]; then
    echo -e "${YELLOW}Warning: Path count mismatch (before: $total_paths_before, after: $total_paths_after)${NC}"
    echo -e "${YELLOW}Some paths may have been overwritten during merge.${NC}"
fi

# Set outputs for GitHub Actions
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "merged-file=$output_file" >> "$GITHUB_OUTPUT"
    echo "path-count=$total_paths_after" >> "$GITHUB_OUTPUT"
fi

echo -e "${GREEN}Merge completed successfully!${NC}"
echo -e "${GREEN}Output file: $output_file${NC}"