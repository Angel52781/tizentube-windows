#!/usr/bin/env python3
"""
TizenTube Windows - Reproducible x64 PE32+ Binary Builder
Copyright (C) 2026 TizenTube Windows Contributors
Licensed under the GNU General Public License v3.0 (GPL-3.0-only).

Generates a deterministic Windows PE32+ (x86-64) GUI executable (TizenTube.exe)
and packages runtime dependencies, configurations, and scripts for distribution.
"""

import os
import sys
import struct
import hashlib
import shutil
import subprocess
from pathlib import Path

# Deterministic timestamp (corresponds to project freeze / commit epoch)
DETERMINISTIC_TIMESTAMP = 0x6717A000  # 2024-10-22 12:52:16 UTC

def build_pe32plus_binary():
    """
    Constructs a valid, bit-exact PE32+ (x86-64) GUI Windows executable.
    Subsystem: Windows GUI (2)
    Machine: AMD64 / x86-64 (0x8664)
    Behavior:
      1. Tries to launch native compiled host TizenTubeHost.exe
      2. If not found / HINSTANCE <= 32, displays Win32 MessageBoxW modal error
         instructing the user to compile the host, then exits with code 1.
      3. Never delegates to PowerShell or Edge --app.
    """
    file_align = 0x200
    section_align = 0x1000

    image_base = 0x140000000
    rva_text = 0x1000
    rva_rdata = 0x2000
    rva_data = 0x3000

    # 1. Prepare .data section content
    off_verb = 0x00
    verb_open = "open\x00".encode('utf-16le')

    off_exe_host = 0x20
    exe_host = "TizenTubeHost.exe\x00".encode('utf-16le')

    off_caption = 0x60
    caption_error = "TizenTube Windows - Host Not Found\x00".encode('utf-16le')

    off_msg = 0xC0
    msg_error = (
        "TizenTube native multimedia host (TizenTubeHost.exe) was not found.\r\n\r\n"
        "Please compile TizenTubeHost.cs using .NET SDK 8.0+ ('dotnet publish') "
        "or execute scripts\\build.bat before launching.\x00"
    ).encode('utf-16le')

    data_sec = bytearray(file_align * 2)  # 0x400 (1024 bytes)
    data_sec[off_verb:off_verb+len(verb_open)] = verb_open
    data_sec[off_exe_host:off_exe_host+len(exe_host)] = exe_host
    data_sec[off_caption:off_caption+len(caption_error)] = caption_error
    data_sec[off_msg:off_msg+len(msg_error)] = msg_error

    # 2. Prepare .rdata section content (PE Import Directory)
    # Imports:
    # KERNEL32.dll: ExitProcess
    # SHELL32.dll: ShellExecuteW
    # USER32.dll: MessageBoxW
    rdata_sec = bytearray(file_align * 2)  # 0x400 bytes

    rva_ilt_k32 = rva_rdata + 0x50
    rva_ilt_sh32 = rva_rdata + 0x60
    rva_ilt_u32 = rva_rdata + 0x70

    rva_iat_k32 = rva_rdata + 0x80
    rva_iat_sh32 = rva_rdata + 0x90
    rva_iat_u32 = rva_rdata + 0xA0

    rva_hint_exit = rva_rdata + 0xB0
    rva_hint_shellexec = rva_rdata + 0xC0
    rva_hint_msgbox = rva_rdata + 0xD0

    rva_str_k32 = rva_rdata + 0xE0
    rva_str_sh32 = rva_rdata + 0xF0
    rva_str_u32 = rva_rdata + 0x100

    # IDT (4 entries: 3 DLLs + null terminator)
    idt = bytearray()
    idt += struct.pack('<IIIII', rva_ilt_k32, 0, 0, rva_str_k32, rva_iat_k32)
    idt += struct.pack('<IIIII', rva_ilt_sh32, 0, 0, rva_str_sh32, rva_iat_sh32)
    idt += struct.pack('<IIIII', rva_ilt_u32, 0, 0, rva_str_u32, rva_iat_u32)
    idt += bytearray(20)  # Terminator
    rdata_sec[0:len(idt)] = idt

    # ILTs
    rdata_sec[0x50:0x60] = struct.pack('<QQ', rva_hint_exit, 0)
    rdata_sec[0x60:0x70] = struct.pack('<QQ', rva_hint_shellexec, 0)
    rdata_sec[0x70:0x80] = struct.pack('<QQ', rva_hint_msgbox, 0)

    # IATs
    rdata_sec[0x80:0x90] = struct.pack('<QQ', rva_hint_exit, 0)
    rdata_sec[0x90:0xA0] = struct.pack('<QQ', rva_hint_shellexec, 0)
    rdata_sec[0xA0:0xB0] = struct.pack('<QQ', rva_hint_msgbox, 0)

    # Hint/Name entries
    rdata_sec[0xB0:0xC0] = struct.pack('<H', 0) + b'ExitProcess\x00\x00\x00'
    rdata_sec[0xC0:0xD0] = struct.pack('<H', 0) + b'ShellExecuteW\x00'
    rdata_sec[0xD0:0xE0] = struct.pack('<H', 0) + b'MessageBoxW\x00\x00\x00'

    # DLL Name strings
    rdata_sec[0xE0:0xEE] = b'KERNEL32.dll\x00\x00'
    rdata_sec[0xF0:0xFC] = b'SHELL32.dll\x00'
    rdata_sec[0x100:0x10C] = b'USER32.dll\x00\x00'

    # 3. Prepare .text section (x86-64 Machine Code)
    # Entry Point RVA = 0x1000
    text_sec = bytearray(file_align)
    code = bytearray()

    # sub rsp, 56 (0x38 shadow space + alignment)
    code += b'\x48\x83\xec\x38'

    # 1. ShellExecuteW(NULL, L"open", L"TizenTubeHost.exe", NULL, NULL, SW_SHOWNORMAL)
    # xor ecx, ecx (hwnd = NULL)
    code += b'\x31\xc9'

    # lea rdx, [rip + disp32] -> rva_data + off_verb
    target = rva_data + off_verb
    curr = rva_text + len(code) + 7
    code += b'\x48\x8d\x15' + struct.pack('<i', target - curr)

    # lea r8, [rip + disp32] -> rva_data + off_exe_host
    target = rva_data + off_exe_host
    curr = rva_text + len(code) + 7
    code += b'\x4c\x8d\x05' + struct.pack('<i', target - curr)

    # xor r9d, r9d (lpParameters = NULL)
    code += b'\x45\x31\xc9'

    # mov qword ptr [rsp + 0x20], 0 (lpDirectory = NULL)
    code += b'\x48\xc7\x44\x24\x20\x00\x00\x00\x00'

    # mov dword ptr [rsp + 0x28], 1 (nShowCmd = SW_SHOWNORMAL = 1)
    code += b'\xc7\x44\x24\x28\x01\x00\x00\x00'

    # call qword ptr [rip + disp32] -> ShellExecuteW (rva_iat_sh32)
    target = rva_iat_sh32
    curr = rva_text + len(code) + 6
    code += b'\xff\x15' + struct.pack('<i', target - curr)

    # cmp rax, 32
    code += b'\x48\x83\xf8\x20'

    # ja host_started (jump to clean exit 0)
    ja_idx = len(code)
    code += b'\x77\x00'

    # --- Error branch: MessageBoxW(NULL, msg_error, caption_error, MB_ICONERROR | MB_OK) ---
    # xor ecx, ecx (hWnd = NULL)
    code += b'\x31\xc9'

    # lea rdx, [rip + disp32] -> rva_data + off_msg
    target = rva_data + off_msg
    curr = rva_text + len(code) + 7
    code += b'\x48\x8d\x15' + struct.pack('<i', target - curr)

    # lea r8, [rip + disp32] -> rva_data + off_caption
    target = rva_data + off_caption
    curr = rva_text + len(code) + 7
    code += b'\x4c\x8d\x05' + struct.pack('<i', target - curr)

    # mov r9d, 0x10 (uType = MB_ICONERROR | MB_OK)
    code += b'\x41\xb9\x10\x00\x00\x00'

    # call qword ptr [rip + disp32] -> MessageBoxW (rva_iat_u32)
    target = rva_iat_u32
    curr = rva_text + len(code) + 6
    code += b'\xff\x15' + struct.pack('<i', target - curr)

    # mov ecx, 1 (uExitCode = 1)
    code += b'\xb9\x01\x00\x00\x00'

    # call qword ptr [rip + disp32] -> ExitProcess (rva_iat_k32)
    target = rva_iat_k32
    curr = rva_text + len(code) + 6
    code += b'\xff\x15' + struct.pack('<i', target - curr)

    # --- host_started branch ---
    host_offset = len(code)
    code[ja_idx + 1] = host_offset - (ja_idx + 2)

    # xor ecx, ecx (uExitCode = 0)
    code += b'\x31\xc9'

    # call qword ptr [rip + disp32] -> ExitProcess (rva_iat_k32)
    target = rva_iat_k32
    curr = rva_text + len(code) + 6
    code += b'\xff\x15' + struct.pack('<i', target - curr)

    # add rsp, 56
    code += b'\x48\x83\xc4\x38'

    # ret
    code += b'\xc3'

    text_sec[0:len(code)] = code

    # 4. DOS Header & Stub
    dos_header = bytearray(64)
    dos_header[0:2] = b'MZ'
    dos_header[0x3C:0x40] = struct.pack('<I', 0x80)
    dos_stub = b'TizenTube Windows Core x64 Binary\x00' + b'\x00' * (0x80 - 64 - 34)
    pe_sig = b'PE\x00\x00'

    # 5. COFF File Header (20 bytes)
    machine = 0x8664  # AMD64 / x86-64
    num_sections = 3  # .text, .rdata, .data
    ptr_syms = 0
    num_syms = 0
    size_opt_header = 240
    characteristics = 0x0022  # EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE
    coff_header = struct.pack('<HHIIIHH', machine, num_sections, DETERMINISTIC_TIMESTAMP, ptr_syms, num_syms, size_opt_header, characteristics)

    # 6. Optional Header (PE32+, 240 bytes)
    magic = 0x020b  # PE32+
    major_linker = 14
    minor_linker = 0
    size_of_code = len(text_sec)
    size_init_data = len(rdata_sec) + len(data_sec)
    size_uninit_data = 0
    entry_point = rva_text
    base_of_code = rva_text

    major_os = 6
    minor_os = 1
    major_img = 1
    minor_img = 0
    major_subsys = 6
    minor_subsys = 1
    win32_version = 0
    size_of_image = 0x4000  # 4 Virtual pages
    size_of_headers = 0x200
    checksum = 0
    subsystem = 2  # Windows GUI
    dll_characteristics = 0x8160  # HIGH_ENTROPY_VA | DYNAMIC_BASE | NX_COMPAT | TERMINAL_SERVER_AWARE
    size_stack_reserve = 0x100000
    size_stack_commit = 0x1000
    size_heap_reserve = 0x100000
    size_heap_commit = 0x1000
    loader_flags = 0
    num_rva_sizes = 16

    opt_standard = struct.pack('<HBBIIIII', magic, major_linker, minor_linker, size_of_code, size_init_data, size_uninit_data, entry_point, base_of_code)
    opt_windows = struct.pack('<QIIHHHHHHIIIIHHQQQQII',
        image_base, section_align, file_align,
        major_os, minor_os, major_img, minor_img, major_subsys, minor_subsys,
        win32_version, size_of_image, size_of_headers, checksum,
        subsystem, dll_characteristics,
        size_stack_reserve, size_stack_commit, size_heap_reserve, size_heap_commit,
        loader_flags, num_rva_sizes
    )

    data_directories = bytearray(16 * 8)
    # Entry 1: Import Directory (RVA 0x2000, Size len(idt))
    data_directories[8:16] = struct.pack('<II', rva_rdata, len(idt))
    # Entry 12: IAT Directory (RVA 0x2080, Size 48)
    data_directories[12*8:12*8+8] = struct.pack('<II', rva_iat_k32, 48)

    opt_header = opt_standard + opt_windows + data_directories

    # 7. Section Headers (3 x 40 bytes)
    sec_text = struct.pack('<8sIIIIIIHHI', b'.text\x00\x00\x00', len(code), rva_text, len(text_sec), 0x200, 0, 0, 0, 0, 0x60000020)
    sec_rdata = struct.pack('<8sIIIIIIHHI', b'.rdata\x00\x00', 0x110, rva_rdata, len(rdata_sec), 0x400, 0, 0, 0, 0, 0x40000040)
    sec_data = struct.pack('<8sIIIIIIHHI', b'.data\x00\x00\x00', off_msg + len(msg_error), rva_data, len(data_sec), 0x800, 0, 0, 0, 0, 0xC0000040)

    headers = dos_header + dos_stub + pe_sig + coff_header + opt_header + sec_text + sec_rdata + sec_data
    if len(headers) > 0x200:
        raise ValueError(f"Headers size exceeded 0x200: {len(headers)}")
    if len(headers) < 0x200:
        headers += b'\x00' * (0x200 - len(headers))

    pe_binary = headers + text_sec + rdata_sec + data_sec
    return pe_binary

def package_distribution(root_dir):
    """
    Assembles the complete distribution package under dist/TizenTube-win-x64/
    """
    # 0. Ensure JS bundling has occurred
    bundler_script = root_dir / "scripts" / "bundle_mods.js"
    if bundler_script.exists():
        try:
            subprocess.run(["node", str(bundler_script)], check=True, cwd=str(root_dir))
        except Exception as e:
            print(f"[WARN] JS bundling script returned error: {e}")

    dist_dir = root_dir / "dist" / "TizenTube-win-x64"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True, exist_ok=True)

    # 1. Build and write PE32+ executable
    pe_data = build_pe32plus_binary()
    exe_path = dist_dir / "TizenTube.exe"
    with open(exe_path, "wb") as f:
        f.write(pe_data)

    # 2. Copy application code and runtime assets
    app_target_dir = dist_dir / "app"
    # The shared VPS can reject directory copystat/chmod even for owner-created
    # dirs. Copy actual content, not source directory mode/timestamps. Never
    # fall back to stale distribution binaries when a fresh build fails.
    src_dir = root_dir / "src"
    for source in sorted(src_dir.rglob("*")):
        if source.is_symlink():
            raise RuntimeError(f"Source tree must not contain symlinks: {source}")
        target = app_target_dir / source.relative_to(src_dir)
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif source.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        else:
            raise RuntimeError(f"Unexpected source entry: {source}")

    # 3. Write Windows helper launchers
    launch_ps1 = dist_dir / "launch.ps1"
    launch_ps1.write_text(r"""# TizenTube Windows Launch Script
# Copyright (C) 2026 TizenTube Windows Contributors
# Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $appDir

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  TizenTube Windows (x64) - Native Host Launcher" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Check for compiled native host binary
$hostExe = Join-Path $appDir "TizenTubeHost.exe"
if (Test-Path $hostExe) {
    Write-Host "[OK] Launching native WebView2 host (TizenTubeHost.exe)..." -ForegroundColor Green
    Start-Process -FilePath $hostExe
    exit 0
}

# 2. If not compiled, attempt to build using .NET SDK if available
$csproj = Join-Path $appDir "TizenTubeWindows.csproj"
if (-not (Test-Path $csproj)) {
    $csproj = Join-Path $appDir "app\native\TizenTubeWindows.csproj"
}

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if ($dotnet -and (Test-Path $csproj)) {
    Write-Host "[INFO] TizenTubeHost.exe not found. Compiling via .NET SDK..." -ForegroundColor Yellow
    & dotnet publish $csproj -c Release -r win-x64 --self-contained false -o $appDir
    if (Test-Path $hostExe) {
        Write-Host "[OK] Compilation successful. Launching TizenTubeHost.exe..." -ForegroundColor Green
        Start-Process -FilePath $hostExe
        exit 0
    }
}

# 3. Fail honestly if native host is absent; DO NOT substitute with Edge --app
Write-Host "[ERROR] Native multimedia host (TizenTubeHost.exe) was not found." -ForegroundColor Red
Write-Host "[ERROR] A compiled native host is required for ad blocking, SponsorBlock, and DeArrow." -ForegroundColor Red
Write-Host "[INFO]  To compile TizenTubeHost.exe on Windows:" -ForegroundColor Yellow
Write-Host "        1. Ensure .NET 8.0 SDK is installed." -ForegroundColor Yellow
Write-Host "        2. Run: dotnet publish TizenTubeWindows.csproj -c Release -r win-x64 --self-contained false -o ." -ForegroundColor Yellow
Write-Host "        Or run scripts\build.bat from the repository root." -ForegroundColor Yellow
exit 1
""", encoding="utf-8")

    # launch.cmd for double-click execution on Windows
    launch_cmd = dist_dir / "launch.cmd"
    launch_cmd.write_text("@echo off\r\nrem Copyright (C) 2026 TizenTube Windows Contributors\r\nrem Licensed under the GNU General Public License v3.0 (GPL-3.0-only).\r\npowershell -ExecutionPolicy Bypass -File \"%~dp0launch.ps1\"\r\n", encoding="utf-8")

    # Copy C# host source and .csproj for native build
    shutil.copy(root_dir / "src" / "native" / "TizenTubeHost.cs", dist_dir / "TizenTubeHost.cs")
    shutil.copy(root_dir / "src" / "native" / "TizenTubeWindows.csproj", dist_dir / "TizenTubeWindows.csproj")
    manifest_src = root_dir / "src" / "native" / "app.manifest"
    if manifest_src.exists():
        shutil.copy(manifest_src, dist_dir / "app.manifest")

    # Copy GPL-3.0 License
    license_src = root_dir / "LICENSE"
    if license_src.exists():
        shutil.copy(license_src, dist_dir / "LICENSE")

    # 4. Generate SHA256 checksums
    checksum_lines = []
    for file_path in sorted(dist_dir.rglob("*")):
        if file_path.is_file() and file_path.name != "SHA256SUMS.txt":
            rel_path = file_path.relative_to(dist_dir)
            hasher = hashlib.sha256()
            with open(file_path, "rb") as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            checksum_lines.append(f"{hasher.hexdigest()}  {rel_path.as_posix()}\n")

    sums_file = dist_dir / "SHA256SUMS.txt"
    sums_file.write_text("".join(checksum_lines), encoding="utf-8")

    # Calculate TizenTube.exe SHA-256
    exe_sha256 = hashlib.sha256(pe_data).hexdigest()

    return {
        "exePath": str(exe_path),
        "exeSha256": exe_sha256,
        "exeSizeBytes": len(pe_data),
        "distDir": str(dist_dir),
        "fileCount": len(checksum_lines) + 1
    }

def main():
    root_dir = Path(__file__).resolve().parent.parent
    print(f"Building TizenTube Windows x64 reproducible distribution from {root_dir}...")
    res = package_distribution(root_dir)
    print("Build successful:")
    print(f"  Binary:     {res['exePath']}")
    print(f"  SHA-256:    {res['exeSha256']}")
    print(f"  Size:       {res['exeSizeBytes']} bytes")
    print(f"  Files:      {res['fileCount']} packaged in {res['distDir']}")

if __name__ == "__main__":
    main()
