#!/bin/bash
# Count all lines in all files under src/ (recursively)
cd "$(dirname "$0")" || exit 1

echo "pretticlaw src/ line count"
echo "================================"
echo ""

total=$(find src -type f -exec cat {} + | wc -l)
echo "  Total lines in src/: $total"