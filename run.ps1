# FEYORA PC Launcher PowerShell Runner (Native Console App)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$pythonExe = $null

$candidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "C:\Program Files\Python313\python.exe"
)

foreach ($c in $candidates) {
    if (Test-Path $c) {
        $pythonExe = $c
        break
    }
}

if (-not $pythonExe) {
    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) { $pythonExe = $pyCmd.Source }
}

if (-not $pythonExe) {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) { $pythonExe = $pythonCmd.Source }
}

if (-not $pythonExe) {
    $wildcard = Get-Item "$env:LOCALAPPDATA\Programs\Python\Python*\python.exe" -ErrorAction SilentlyContinue
    if ($wildcard) { $pythonExe = $wildcard[0].FullName }
}

if (-not $pythonExe) {
    Write-Host "[ERRORE] Impossibile trovare l'interprete Python sul computer." -ForegroundColor Red
    Pause
    exit 1
}

# Avvia l'applicazione nativa standalone
Start-Process -FilePath $pythonExe -ArgumentList "main.py" -WorkingDirectory $ScriptDir
