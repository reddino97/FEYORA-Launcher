"""Percorsi dell'app.

- RES_DIR / STATIC_DIR: risorse in sola lettura (nell'exe PyInstaller stanno in _MEIPASS).
- DATA_DIR: dati dell'utente (launcher_data.json, copertine). Devono stare in una
  cartella scrivibile e persistente, NON accanto al sorgente / nella cartella temporanea.

Da sorgente (python main.py) i dati restano in ./data come prima.
Nell'exe vanno in %APPDATA%\\FEYORA\\data.
Si puo' forzare un percorso con la variabile d'ambiente FEYORA_DATA_DIR.
"""
import os
import sys

APP_NAME = "FEYORA"
FROZEN = bool(getattr(sys, "frozen", False))

if FROZEN:
    RES_DIR = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
else:
    RES_DIR = os.path.dirname(os.path.abspath(__file__))

STATIC_DIR = os.path.join(RES_DIR, "static")

_appdata = os.environ.get("APPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Roaming")
USER_DIR = os.path.join(_appdata, APP_NAME)   # log e dati dell'exe
LOG_FILE = os.path.join(USER_DIR, "feyora.log")

_override = os.environ.get("FEYORA_DATA_DIR")
if _override:
    DATA_DIR = _override
elif FROZEN:
    DATA_DIR = os.path.join(USER_DIR, "data")
else:
    DATA_DIR = os.path.join(RES_DIR, "data")

COVERS_DIR = os.path.join(DATA_DIR, "covers")
DATA_FILE = os.path.join(DATA_DIR, "launcher_data.json")


def ensure_dirs():
    os.makedirs(USER_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(COVERS_DIR, exist_ok=True)
