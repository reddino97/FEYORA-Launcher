@echo off
setlocal
cd /d "%~dp0"
title FEYORA - build

set "PYTHON=C:\Users\ilross\AppData\Local\Programs\Python\Python313\python.exe"
if not exist "%PYTHON%" (
    echo [ERRORE] Python non trovato nel percorso configurato: %PYTHON%
    goto :fail
)

echo.
echo === [1/3] Installo le dipendenze ===
"%PYTHON%" -m pip install -r requirements.txt pyinstaller
if errorlevel 1 goto :fail

echo.
echo === [2/3] Creo l'exe con PyInstaller ===
"%PYTHON%" -m PyInstaller --noconfirm --clean feyora.spec
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
echo Exe:  dist\FEYORA\FEYORA.exe
pause
exit /b 0

:fail
echo.
echo [ERRORE] Build fallita. Copia qui sopra l'ultimo errore e mandamelo.
pause
exit /b 1
