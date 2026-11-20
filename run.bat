@echo off
setlocal
cd /d "%~dp0"

:: Cerca pythonw.exe (esecutore silenzioso senza finestra di console)
set "PYTHONW_EXE=%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe"
if not exist "%PYTHONW_EXE%" (
    for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
        if exist "%%D\pythonw.exe" set "PYTHONW_EXE=%%D\pythonw.exe"
    )
)
if not exist "%PYTHONW_EXE%" (
    for /d %%D in ("C:\Program Files\Python*") do (
        if exist "%%D\pythonw.exe" set "PYTHONW_EXE=%%D\pythonw.exe"
    )
)
if not exist "%PYTHONW_EXE%" set "PYTHONW_EXE=pythonw.exe"

:: Avvia senza finestra di terminale
start "" "%PYTHONW_EXE%" main.py
exit
