@echo off
rem ==============================================================================
rem TizenTube Windows - Native Windows Build Script
rem Copyright (C) 2026 TizenTube Windows Contributors
rem Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
rem ==============================================================================
setlocal enabledelayedexpansion

echo ==================================================
echo   TizenTube Windows - Native Windows Build Script
echo ==================================================

set PROJECT_ROOT=%~dp0..
cd /d "%PROJECT_ROOT%"

echo [1/4] Bundling JavaScript Mods and UI into standalone IIFE...
where node >nul 2>nul
if %errorlevel% equ 0 (
    node scripts\bundle_mods.js
    if errorlevel 1 (
        echo [ERROR] JavaScript bundling failed.
        exit /b 1
    )
) else (
    echo [NOTE] Node.js not detected; using existing bundled scripts in src\mods.
)

echo [2/4] Compiling Native C# Host (.NET / WebView2)...
python scripts\build_icon.py
if errorlevel 1 (
    echo [ERROR] Cannot generate application icon.
    exit /b 1
)
where dotnet >nul 2>nul
if %errorlevel% equ 0 (
    echo Found .NET SDK. Publishing TizenTubeHost (win-x64)...
    dotnet publish src\native\TizenTubeWindows.csproj -c Release -f net8.0-windows -r win-x64 --self-contained false -o dist\TizenTube-win-x64
    if exist "dist\TizenTube-win-x64\TizenTubeHost.exe" (
        echo [OK] TizenTubeHost.exe compiled successfully via .NET SDK.
    )
) else (
    echo [NOTE] dotnet CLI not found in PATH. Checking for csc.exe...
    set CSC_PATH=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
    if exist "%CSC_PATH%" (
        echo Found .NET Framework compiler at %CSC_PATH%
        echo Note: Standalone csc requires Microsoft.Web.WebView2 NuGet libraries.
    ) else (
        echo [NOTE] Install .NET SDK 8.0+ or Visual Studio to compile TizenTubeHost.exe.
    )
)

echo [3/4] Running Reproducible PE Builder...
python scripts\build_x64.py
if errorlevel 1 (
    echo [ERROR] PE Builder failed.
    exit /b 1
)

echo [4/4] Verifying PE32+ Binary...
python scripts\verify_pe.py dist\TizenTube-win-x64\TizenTube.exe
if errorlevel 1 (
    echo [ERROR] PE Verification failed.
    exit /b 1
)

echo ==================================================
echo   Build Completed Successfully!
echo ==================================================
