#!/bin/bash

set -euo pipefail

# Get input parameters
INPUT_FILES="${1}"
OUTPUT_PATH="${2:-./merged-openapi.yaml}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create necessary directories
OUTPUT_DIR=$(dirname "$OUTPUT_PATH")
echo -e "${BLUE}Creating output directory: $OUTPUT_DIR${NC}"
mkdir -p "$OUTPUT_DIR"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf $TEMP_DIR' EXIT

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
        redocly bundle "$input_file" -o "$output_file" || {
            echo -e "${RED}Failed to convert $input_file${NC}"
            return 1
        }
    else
        # Already YAML, just copy
        cp "$input_file" "$output_file"
    fi
    
    return 0
}

# Expand glob patterns and collect files
echo -e "${BLUE}Finding OpenAPI spec files...${NC}"
spec_files=()

# Handle comma-separated list or space-separated globs
IFS=',' read -ra PATTERNS <<< "$INPUT_FILES"
for pattern in "${PATTERNS[@]}"; do
    # Trim whitespace
    pattern=$(echo "$pattern" | xargs)
    
    # Check if it's a direct file path
    if [ -f "$pattern" ]; then
        spec_files+=("$pattern")
    else
        # Try glob expansion
        shopt -s nullglob globstar
        for file in $pattern; do
            if [ -f "$file" ]; then
                spec_files+=("$file")
            fi
        done
        shopt -u nullglob globstar
        
        # If no files found with glob, try find for more complex patterns
        while IFS= read -r -d '' file; do
            if [ -f "$file" ]; then
                spec_files+=("$file")
            fi
        done < <(find . -path "$pattern" -type f -print0 2>/dev/null)
    fi
done

# Remove duplicates and empty entries
if [ ${#spec_files[@]} -gt 0 ]; then
    mapfile -t spec_files < <(printf "%s\n" "${spec_files[@]}" | grep -v '^$' | sort -u)
fi

if [ ${#spec_files[@]} -eq 0 ]; then
    echo -e "${RED}No OpenAPI spec files found matching patterns: $INPUT_FILES${NC}"
    exit 1
fi

echo -e "${GREEN}Found ${#spec_files[@]} spec files:${NC}"
for file in "${spec_files[@]}"; do
    echo -e "  ${BLUE}$file${NC}"
done

# Convert all files to YAML and count paths
total_paths_before=0
yaml_files=()

for spec_file in "${spec_files[@]}"; do
    basename_no_ext=$(basename "${spec_file%.*}")
    # Add index to handle duplicate basenames
    index=0
    yaml_file="$TEMP_DIR/${basename_no_ext}.yaml"
    while [ -f "$yaml_file" ]; do
        ((index++))
        yaml_file="$TEMP_DIR/${basename_no_ext}_${index}.yaml"
    done
    
    if convert_to_yaml "$spec_file" "$yaml_file"; then
        path_count=$(count_paths "$yaml_file")
        echo -e "${BLUE}  $(basename "$spec_file"): $path_count paths${NC}"
        total_paths_before=$((total_paths_before + path_count))
        yaml_files+=("$yaml_file")
    fi
done

echo -e "${GREEN}Total paths before merge: $total_paths_before${NC}"

# Merge files using redocly
echo -e "${BLUE}Merging ${#yaml_files[@]} files...${NC}"

if [ ${#yaml_files[@]} -eq 1 ]; then
    # Only one file, just copy it
    cp "${yaml_files[0]}" "$OUTPUT_PATH"
else
    # Merge multiple files
    redocly join "${yaml_files[@]}" -o "$OUTPUT_PATH" || {
        echo -e "${RED}Failed to merge files${NC}"
        exit 1
    }
fi

# Verify the merge
total_paths_after=$(count_paths "$OUTPUT_PATH")
echo -e "${GREEN}Total paths after merge: $total_paths_after${NC}"

if [ "$total_paths_after" -ne "$total_paths_before" ]; then
    echo -e "${YELLOW}Warning: Path count mismatch (before: $total_paths_before, after: $total_paths_after)${NC}"
    echo -e "${YELLOW}Some paths may have been overwritten during merge.${NC}"
fi

# Set outputs for GitHub Actions
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "merged_file=$OUTPUT_PATH" >> "$GITHUB_OUTPUT"
    echo "path_count=$total_paths_after" >> "$GITHUB_OUTPUT"
fi

echo -e "${GREEN}Merge completed successfully!${NC}"
echo -e "${GREEN}Output file: $OUTPUT_PATH${NC}"