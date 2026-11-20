import os
import sys
import socket
import secrets
import threading
import time
import logging
import subprocess
from logging.handlers import RotatingFileHandler

import paths

WINDOW_TITLE = "FEYORA Launcher"
MUTEX_NAME = "Local\\FEYORA.Launcher.SingleInstance"


# ---------------------------------------------------------------- log
class _LogWriter:
    """Sostituto di stdout/stderr quando non c'e' una console (exe --windowed, pythonw)."""
    def __init__(self, level):
        self.level = level

    def write(self, msg):
        msg = (msg or "").strip()
        if msg:
            logging.log(self.level, msg)

    def flush(self):
        pass

    def isatty(self):
        return False


def setup_logging():
    os.makedirs(paths.USER_DIR, exist_ok=True)
    handler = RotatingFileHandler(paths.LOG_FILE, maxBytes=512_000, backupCount=2, encoding="utf-8")
    logging.basicConfig(
        level=logging.INFO,
        handlers=[handler],
        format="%(asctime)s %(levelname)s %(message)s",
    )
    if sys.stdout is None:
        sys.stdout = _LogWriter(logging.INFO)
    if sys.stderr is None:
        sys.stderr = _LogWriter(logging.ERROR)


def fatal(msg):
    logging.error(msg)
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, msg, WINDOW_TITLE, 0x10)
        except Exception:
            pass


# ---------------------------------------------------------------- istanza singola
_mutex_handle = None


def already_running():
    global _mutex_handle
    if sys.platform != "win32":
        return False
    import ctypes
    from ctypes import wintypes
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
    _mutex_handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    return ctypes.get_last_error() == 183  # ERROR_ALREADY_EXISTS


def focus_existing_window():
    try:
        import ctypes
        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, WINDOW_TITLE)
        if hwnd:
            user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            user32.SetForegroundWindow(hwnd)
    except Exception:
        logging.exception("Impossibile portare in primo piano la finestra esistente")


# ---------------------------------------------------------------- server interno
def start_server():
    """Avvia FastAPI su una porta libera. Ritorna (uvicorn_server, port, token) o None."""
    import uvicorn
    import server

    token = secrets.token_urlsafe(32)

    # Il socket viene aperto qui e passato a uvicorn: nessuna porta fissa, nessuna race.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind((server.HOST, 0))
    port = sock.getsockname()[1]

    server.PORT = port
    server.SESSION_TOKEN = token

    config = uvicorn.Config(
        server.app,
        log_config=None,
        log_level="warning",
        access_log=False,
    )
    srv = uvicorn.Server(config)

    def _run():
        try:
            srv.run(sockets=[sock])
        except Exception:
            logging.exception("Il server interno si e' fermato")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    deadline = time.time() + 60   # la prima scansione delle librerie puo' essere lenta
    while not srv.started:
        if not thread.is_alive() or time.time() > deadline:
            return None
        time.sleep(0.05)

    logging.info("Server pronto su 127.0.0.1:%s", port)
    return srv, port, token


# ---------------------------------------------------------------- finestra nativa
class NativeApi:
    def __init__(self):
        self._window = None

    def toggle_fullscreen(self):
        if self._window:
            self._window.toggle_fullscreen()
            return self._window.fullscreen
        return False

    def close(self):
        if self._window:
            self._window.destroy()

    def minimize(self):
        if self._window:
            self._window.minimize()

    def open_keyboard(self):
        """Apre la tastiera virtuale di Windows per gli input del launcher."""
        if sys.platform != "win32":
            return False
        for command in (("TabTip.exe",), ("osk.exe",)):
            try:
                subprocess.Popen(command, close_fds=True)
                return True
            except OSError:
                continue
        return False


def make_file_dialog(window):
    types = {
        "image": ("File Immagine (*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.gif)", "Tutti i file (*.*)"),
        "exe": ("App e giochi (*.exe;*.lnk;*.bat;*.url)", "Tutti i file (*.*)"),
    }

    def pick(kind="image"):
        import webview
        dialog_type = webview.FileDialog.OPEN if hasattr(webview, "FileDialog") else webview.OPEN_DIALOG
        result = window.create_file_dialog(
            dialog_type,
            allow_multiple=False,
            file_types=types.get(kind, types["image"]),
        )
        return result[0] if result else None
    return pick


def main():
    setup_logging()
    logging.info("Avvio FEYORA (frozen=%s, dati in %s)", paths.FROZEN, paths.DATA_DIR)

    if already_running():
        logging.info("Istanza gia' in esecuzione: porto in primo piano quella esistente")
        focus_existing_window()
        return 0

    started = start_server()
    if not started:
        fatal("Impossibile avviare il server interno di FEYORA.\n\nDettagli nel file:\n" + paths.LOG_FILE)
        return 1
    srv, port, token = started

    import webview
    import server

    try:
        start_fs = bool(server._settings_with_defaults(server.load_data()).get("start_fullscreen", True))
    except Exception:
        start_fs = True
    api = NativeApi()
    window = webview.create_window(
        title=WINDOW_TITLE,
        url=f"http://{server.HOST}:{port}/?t={token}",
        js_api=api,
        width=1280,
        height=720,
        fullscreen=start_fs,
        background_color="#060812",
        text_select=False,
        confirm_close=False,
    )
    api._window = window
    server.file_dialog_hook = make_file_dialog(window)

    webview.start(gui="edgechromium", debug=False)
    srv.should_exit = True
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except Exception:
        logging.exception("Errore fatale")
        fatal("FEYORA si e' chiuso a causa di un errore.\n\nDettagli nel file:\n" + paths.LOG_FILE)
        code = 1
    sys.exit(code)
