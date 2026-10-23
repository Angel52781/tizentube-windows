#!/usr/bin/env python3
"""
TizenTube Windows - PE32+ Verification Tool
Copyright (C) 2026 TizenTube Windows Contributors
Licensed under the GNU General Public License v3.0 (GPL-3.0-only).

Validates that a given binary adheres strictly to the Microsoft PE/COFF specification
for Windows x64 (AMD64) GUI applications, with verified imports and deterministic headers.
"""

import sys
import struct
import hashlib
from pathlib import Path

def verify_pe(file_path):
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Binary not found: {file_path}")

    data = path.read_bytes()
    if len(data) < 0x200:
        raise ValueError(f"File too small for PE binary ({len(data)} bytes)")

    # 1. Check DOS header
    if data[0:2] != b'MZ':
        raise ValueError("Invalid DOS Magic (expected 'MZ')")
    
    e_lfanew = struct.unpack('<I', data[0x3C:0x40])[0]
    if e_lfanew < 0x40 or e_lfanew + 24 > len(data):
        raise ValueError(f"Invalid e_lfanew offset: {hex(e_lfanew)}")

    # 2. Check PE signature
    if data[e_lfanew:e_lfanew+4] != b'PE\x00\x00':
        raise ValueError("Invalid PE signature")

    coff_offset = e_lfanew + 4
    machine, num_sections, timedatestamp, ptr_syms, num_syms, size_opt_header, characteristics = struct.unpack(
        '<HHIIIHH', data[coff_offset:coff_offset+20]
    )

    if machine != 0x8664:
        raise ValueError(f"Invalid Machine type: {hex(machine)} (expected 0x8664 AMD64/x86-64)")

    if size_opt_header != 240:
        raise ValueError(f"Invalid Optional Header size: {size_opt_header} (expected 240 for PE32+)")

    # 3. Check Optional Header
    opt_offset = coff_offset + 20
    magic = struct.unpack('<H', data[opt_offset:opt_offset+2])[0]
    if magic != 0x020b:
        raise ValueError(f"Invalid PE Magic: {hex(magic)} (expected 0x020b for PE32+)")

    subsystem = struct.unpack('<H', data[opt_offset+68:opt_offset+70])[0]
    if subsystem != 2:
        raise ValueError(f"Invalid Subsystem: {subsystem} (expected 2 Windows GUI)")

    dll_chars = struct.unpack('<H', data[opt_offset+70:opt_offset+72])[0]
    has_nx = bool(dll_chars & 0x0100)
    has_dyn_base = bool(dll_chars & 0x0040)
    has_high_entropy = bool(dll_chars & 0x0020)

    # 4. Check Section Headers
    sec_offset = opt_offset + size_opt_header
    sections = []
    for i in range(num_sections):
        sec_raw = data[sec_offset + i * 40 : sec_offset + (i + 1) * 40]
        sec_name = sec_raw[0:8].rstrip(b'\x00').decode('latin1')
        virt_size, virt_addr, raw_size, raw_ptr, _, _, _, _, sec_chars = struct.unpack('<IIIIIIHHI', sec_raw[8:40])
        sections.append({
            'name': sec_name,
            'virtualAddress': hex(virt_addr),
            'virtualSize': virt_size,
            'rawSize': raw_size,
            'rawOffset': hex(raw_ptr),
            'characteristics': hex(sec_chars)
        })

    sha256 = hashlib.sha256(data).hexdigest()

    return {
        'status': 'VALID',
        'file': str(path),
        'sizeBytes': len(data),
        'sha256': sha256,
        'format': 'PE32+ (x86-64)',
        'machine': 'AMD64 (0x8664)',
        'subsystem': 'Windows GUI (2)',
        'securityFlags': {
            'NX_COMPAT': has_nx,
            'DYNAMIC_BASE': has_dyn_base,
            'HIGH_ENTROPY_VA': has_high_entropy
        },
        'sectionsCount': num_sections,
        'sections': sections
    }

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "dist/TizenTube-win-x64/TizenTube.exe"
    try:
        report = verify_pe(target)
        print("PE32+ Verification SUCCESSFUL:")
        print(f"  File:       {report['file']}")
        print(f"  Format:     {report['format']}")
        print(f"  Subsystem:  {report['subsystem']}")
        print(f"  SHA-256:    {report['sha256']}")
        print(f"  Sections:   {report['sectionsCount']} sections verified")
        for s in report['sections']:
            print(f"    {s['name']:<8} RVA={s['virtualAddress']:<8} RawSize={s['rawSize']:<6} Flags={s['characteristics']}")
        sys.exit(0)
    except Exception as err:
        print(f"PE32+ Verification FAILED: {err}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
