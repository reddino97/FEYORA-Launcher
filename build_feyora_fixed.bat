@echo off
setlocal
cd /d "%~dp0"
title FEYORA - build

set "PYTHON_CMD="
where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys; print(sys.executable)" >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=py -3"
)
if not defined PYTHON_CMD (
    where python >nul 2>&1
    if not errorlevel 1 (
        python -c "import sys; print(sys.executable)" >nul 2>&1
        if not errorlevel 1 set "PYTHON_CMD=python"
    )
)
if not defined PYTHON_CMD (
    echo [ERRORE] Nessuna installazione Python funzionante trovata.
    echo Installa Python oppure verifica il launcher py e il PATH.
    goto :fail
)
echo Python selezionato: %PYTHON_CMD%
%PYTHON_CMD% --version

echo.
echo === [1/3] Installo le dipendenze ===
%PYTHON_CMD% -m pip install -r requirements.txt pyinstaller
if errorlevel 1 goto :fail

echo.
echo === [2/3] Creo l'exe con PyInstaller ===
%PYTHON_CMD% -m PyInstaller --noconfirm --clean feyora.spec
if errorlevel 1 goto :fail
if not exist "dist\FEYORA\FEYORA.exe" goto :fail

echo.
echo === [3/3] Installer (Inno Setup) ===
set "ISCC="
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if defined ISCC (
    "%ISCC%" installer.iss
    if errorlevel 1 goto :fail
    echo Setup creato in: installer_output
) else (
    echo Inno Setup non trovato: salto l'installer. L'app e' in dist\FEYORA\FEYORA.exe
)

echo.
echo === FATTO ===
echo Exe: dist\FEYORA\FEYORA.exe
pause
exit /b 0

:fail
echo.
echo [ERRORE] Build fallita. Copia qui sopra l'ultimo errore e mandamelo.
pause
exit /b 1
