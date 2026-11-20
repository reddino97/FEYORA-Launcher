# -*- mode: python ; coding: utf-8 -*-
# Uso:  python -m PyInstaller --noconfirm --clean feyora.spec
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = SPECPATH

datas, binaries, hiddenimports = [], [], []


def add_all(pkg):
    """collect_all che non blocca la build se il pacchetto manca o e' un namespace package."""
    try:
        d, b, h = collect_all(pkg)
        datas.extend(d)
        binaries.extend(b)
        hiddenimports.extend(h)
    except Exception as e:
        print(f"[spec] collect_all({pkg}) saltato: {e}")


def add_submodules(pkg):
    try:
        hiddenimports.extend(collect_submodules(pkg))
    except Exception as e:
        print(f"[spec] collect_submodules({pkg}) saltato: {e}")


# pywebview + backend WebView2 (pythonnet / clr_loader)
for pkg in ("webview", "clr_loader", "pythonnet", "cloudscraper"):
    add_all(pkg)

# uvicorn carica protocolli e loop in modo dinamico
add_submodules("uvicorn")

# widget Spotify (Windows media controls). Import dentro le funzioni: li dichiaro a mano.
add_submodules("winrt")
hiddenimports += [
    "winrt.system",
    "winrt.windows.foundation",
    "winrt.windows.foundation.collections",
    "winrt.windows.media.control",
    "winrt.windows.storage.streams",
    "psutil",
]

# risorse della UI (i dati dell'utente NON vanno inclusi: stanno in %APPDATA%\FEYORA)
datas += [(os.path.join(ROOT, "static"), "static")]

a = Analysis(
    [os.path.join(ROOT, "main.py")],
    pathex=[ROOT],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "_tkinter", "unittest", "pydoc_data"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="FEYORA",
    icon=os.path.join(ROOT, "static", "icon.ico"),
    console=False,      # niente finestra di terminale
    upx=False,          # UPX aumenta i falsi positivi degli antivirus
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="FEYORA",
)
