; Inno Setup 6 Script for TizenTube Windows x64
; Copyright (C) 2026 TizenTube Windows Contributors
; Licensed under the GNU General Public License v3.0 (GPL-3.0-only).

[Setup]
AppName=TizenTube
AppVersion=0.1.0-preview.31
AppPublisher=TizenTube Windows Contributors
AppPublisherURL=https://github.com/Angel52781/tizentube-windows
AppSupportURL=https://github.com/Angel52781/tizentube-windows/issues
AppUpdatesURL=https://github.com/Angel52781/tizentube-windows/releases
DefaultDirName={localappdata}\Programs\TizenTube
DefaultGroupName=TizenTube
OutputDir=..\release-out
OutputBaseFilename=TizenTube-Setup-x64
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
SetupIconFile=..\assets\TizenTube.ico
UninstallDisplayIcon={app}\TizenTube.ico
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\release-out\TizenTube-Windows-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\TizenTube"; Filename: "{app}\TizenTubeHost.exe"; IconFilename: "{app}\TizenTube.ico"
Name: "{group}\{cm:UninstallProgram,TizenTube}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\TizenTube"; Filename: "{app}\TizenTubeHost.exe"; IconFilename: "{app}\TizenTube.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\TizenTubeHost.exe"; Description: "{cm:LaunchProgram,TizenTube}"; Flags: nowait postinstall skipifsilent
