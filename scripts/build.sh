#!/usr/bin/env bash
# ==============================================================================
# TizenTube Windows - Reproducible Build Pipeline
# Copyright (C) 2026 TizenTube Windows Contributors
# Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
# ==============================================================================
set -euo pipefail

echo "=================================================="
echo "  TizenTube Windows - Reproducible Build Pipeline"
echo "=================================================="

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "1. Bundling JavaScript Mods & UI into standalone IIFE..."
node scripts/bundle_mods.js

echo "2. Running Runtime, UI, Bundle, and Telemetry Tests..."
node scripts/test_runtime.js
node scripts/test_ui_features.js
node scripts/test_mods_fault_tolerance.js
node scripts/test_bundle.js
node scripts/test_telemetry.js

echo "3. Compiling PE32+ x64 Windows Executable & Distribution..."
python3 scripts/build_x64.py

echo "4. Verifying PE32+ Binary Specifications & Host Integrity..."
python3 scripts/verify_pe.py dist/TizenTube-win-x64/TizenTube.exe
node scripts/test_host_integrity.js

echo "5. Distribution Checksums:"
cat dist/TizenTube-win-x64/SHA256SUMS.txt

echo "=================================================="
echo "  Build & Verification Completed Successfully!"
echo "=================================================="
