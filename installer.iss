; FEYORA Launcher - script Inno Setup 6 (scarica l'ultima versione da jrsoftware.org)
; Prima di compilare serve la cartella dist\FEYORA creata da build.bat.
; Facoltativo: metti MicrosoftEdgeWebview2Setup.exe in redist\ per installare WebView2 se manca.

#define AppName "FEYORA Launcher"
#define AppVersion "3.0.0"
#define AppExe "FEYORA.exe"

[Setup]
AppId={{A2FB2340-6390-4F84-8AD3-81E3594ECBA4}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=FEYORA
DefaultDirName={autopf}\FEYORA
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=installer_output
OutputBaseFilename=FEYORA-Setup-{#AppVersion}
SetupIconFile=static\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; installa per l'utente corrente senza chiedere admin (si puo' scegliere "per tutti" dal dialogo)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Tasks]
Name: "desktopicon"; Description: "Crea un collegamento sul Desktop"; GroupDescription: "Collegamenti:"
Name: "autostart"; Description: "Avvia FEYORA all'accesso a Windows"; GroupDescription: "Avvio:"; Flags: unchecked

[Files]
Source: "dist\FEYORA\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "redist\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall skipifsourcedoesntexist; Check: NeedsWebView2

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "FEYORA"; ValueData: """{app}\{#AppExe}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installazione di Microsoft WebView2..."; Flags: waituntilterminated skipifdoesntexist; Check: NeedsWebView2
Filename: "{app}\{#AppExe}"; Description: "Avvia {#AppName}"; Flags: nowait postinstall skipifsilent

; I dati dell'utente (%APPDATA%\FEYORA) NON vengono cancellati alla disinstallazione.

[Code]
const
  WebView2Key = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function WebView2Installed: Boolean;
var
  v: String;
begin
  Result := False;
  if RegQueryStringValue(HKLM32, WebView2Key, 'pv', v) then
    Result := (v <> '') and (v <> '0.0.0.0');
  if (not Result) and RegQueryStringValue(HKCU, WebView2Key, 'pv', v) then
    Result := (v <> '') and (v <> '0.0.0.0');
end;

function NeedsWebView2: Boolean;
begin
  Result := not WebView2Installed;
end;
