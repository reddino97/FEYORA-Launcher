import os
import re
import sys
import time
import json
import secrets
import shutil
import hashlib
import webbrowser
import subprocess
import urllib.parse
import tempfile
import threading
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Body, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import uvicorn
import requests

import paths
import scanner
import sgdb
import store

HOST = "127.0.0.1"
PORT = 8765

# Percorsi: risorse (sola lettura) e dati utente (scrivibili) sono separati, vedi paths.py
DATA_DIR = paths.DATA_DIR
COVERS_DIR = paths.COVERS_DIR
DATA_FILE = paths.DATA_FILE
STATIC_DIR = paths.STATIC_DIR
paths.ensure_dirs()

# Impostati da main.py all'avvio (porta scelta a runtime, token di sessione, file dialog nativo)
SESSION_TOKEN: Optional[str] = None
SESSION_COOKIE = "feyora_session"
file_dialog_hook = None
DATA_LOCK = threading.RLock()

DEFAULT_DATA = {
    "favorites": [],
    "playtime": {},
    "last_played": {},
    "custom_covers": {},
    "cover_positions": {},
    "custom_backgrounds": {},
    "settings": {
        "sfx": True,
        "rumble": True,
        "hide_launcher": False,
        "platforms": {"steam": True, "epic": True},
        "nick": "Giocatore 1",
        "avatar": 0,
        "theme": "nexus",
        "lang": "it",
        "sort": "recent",
        "show_emu": True,
        "ui_scale": 100,
        "reduce_motion": False,
        "show_backdrop": True,
        "backdrop_strength": 100,
        "widgets": {"spotify": True, "links": True, "telemetry": True},
        "glyphs": "xbox",
        "sfx_volume": 70,
        "rumble_strength": 100,
        "start_fullscreen": True,
        "store_country": "IT",
        "store_enabled": {"steam": True, "epic": True, "xbox": True},
        "store_favorites": [],
        "sgdb_key": "",
        "itad_key": ""
    },

    "custom_games": [],
    "sgdb_cache": {},
}

def load_data() -> Dict[str, Any]:
    with DATA_LOCK:
        if not os.path.exists(DATA_FILE):
            save_data(DEFAULT_DATA)
            return json.loads(json.dumps(DEFAULT_DATA))
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            for k, v in DEFAULT_DATA.items():
                if k not in data:
                    data[k] = json.loads(json.dumps(v))
            return data
        except Exception as e:
            print("Error loading launcher_data.json:", e)
            return json.loads(json.dumps(DEFAULT_DATA))

def save_data(data: Dict[str, Any]):
    with DATA_LOCK:
        tmp_path = None
        try:
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=os.path.dirname(DATA_FILE),
                                             prefix="launcher_data_", suffix=".tmp", delete=False) as f:
                tmp_path = f.name
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, DATA_FILE)
        except Exception as e:
            print("Error saving launcher_data.json:", e)
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

def _open_uri(uri):
    """Apre un URI/URL con l'app predefinita di Windows (fallback per i test su altri sistemi)."""
    if hasattr(os, "startfile"):
        os.startfile(uri)  # solo Windows
    else:
        webbrowser.open(uri)

def _start_file(path):
    """Avvia un .exe/.lnk/.bat scelto dall'utente (ShellExecute: gestisce anche l'elevazione)."""
    cwd = os.path.dirname(path) or None
    try:
        os.startfile(path, cwd=cwd)
    except TypeError:
        os.startfile(path)

def _pretty_name(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    stem = re.sub(r"\s*-\s*(Collegamento|Shortcut)$", "", stem, flags=re.I)
    if " " not in stem:
        stem = stem.replace("_", " ").replace("-", " ")
    return stem.strip() or "App"

# In-memory cache of scanned games
cached_games: List[Dict[str, Any]] = []

def refresh_games_cache():
    global cached_games
    scanned = scanner.scan_all_games()
    cached_games = scanned
    return cached_games

@asynccontextmanager
async def lifespan(app: FastAPI):
    refresh_games_cache()
    print(f"Startup complete: {len(cached_games)} games detected.")
    yield

app = FastAPI(title="FEYORA Launcher", version="2.5.0", lifespan=lifespan)

@app.middleware("http")
async def local_guard(request: Request, call_next):
    """Accetta solo richieste dalla finestra dell'app.

    - Host consentiti: solo loopback (blocca il DNS rebinding)
    - Origin, se presente, deve essere questo stesso server (niente CORS aperto)
    - /api/* richiede il cookie di sessione, impostato solo quando la pagina viene
      aperta con il token segreto generato da main.py
    """
    host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]")
    if host not in ("127.0.0.1", "localhost"):
        return JSONResponse({"detail": "Forbidden host"}, status_code=403)

    origin = request.headers.get("origin")
    if origin and origin not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"):
        return JSONResponse({"detail": "Forbidden origin"}, status_code=403)

    if SESSION_TOKEN and request.url.path.startswith("/api/"):
        cookie = request.cookies.get(SESSION_COOKIE, "")
        if not secrets.compare_digest(cookie.encode("utf-8"), SESSION_TOKEN.encode("utf-8")):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    return await call_next(request)

@app.get("/api/games")
def get_games():
    global cached_games
    if not cached_games:
        refresh_games_cache()
    data = load_data()
    favs = set(data.get("favorites", []))
    playtimes = data.get("playtime", {})
    last_played = data.get("last_played", {})
    custom = data.get("custom_games", [])
    custom_covers = data.get("custom_covers", {})
    cover_positions = data.get("cover_positions", {})
    custom_backgrounds = data.get("custom_backgrounds", {})
    
    all_games = []
    # Merge scanned games
    for g in cached_games:
        item = dict(g)
        item["is_fav"] = item["id"] in favs
        item["hours"] = playtimes.get(item["id"], 0)
        if item["id"] in last_played:
            # "ultimo aperto": vale il piu' recente tra avvii da FEYORA e dati di Steam
            item["last_played"] = max(int(item.get("last_played") or 0), int(last_played[item["id"]] or 0))
        # Override with custom cover if set
        if item["id"] in custom_covers and custom_covers[item["id"]]:
            item["poster_url"] = custom_covers[item["id"]]
            item["is_custom_cover"] = True
        else:
            item["is_custom_cover"] = False
        item["cover_position"] = cover_positions.get(item["id"], {"x": 50, "y": 25})
        if item["id"] in custom_backgrounds and custom_backgrounds[item["id"]]:
            item["banner_url"] = custom_backgrounds[item["id"]]
            item["is_custom_background"] = True
        else:
            item["is_custom_background"] = False
        all_games.append(item)
        
    # Merge custom games
    for cg in custom:
        item = dict(cg)
        item["is_fav"] = item["id"] in favs
        item["hours"] = playtimes.get(item["id"], 0)
        item["last_played"] = last_played.get(item["id"], 0)
        if item["id"] in custom_covers and custom_covers[item["id"]]:
            item["poster_url"] = custom_covers[item["id"]]
            item["is_custom_cover"] = True
        else:
            item["is_custom_cover"] = False
        item["cover_position"] = cover_positions.get(item["id"], {"x": 50, "y": 25})
        if item["id"] in custom_backgrounds and custom_backgrounds[item["id"]]:
            item["banner_url"] = custom_backgrounds[item["id"]]
            item["is_custom_background"] = True
        else:
            item["is_custom_background"] = False
        all_games.append(item)
        
    sgdb_cache = data.get("sgdb_cache", {})
    for item in all_games:
        if not item.get("added_at"):
            try:
                item["added_at"] = int(os.path.getmtime(item["install_path"])) if item.get("install_path") else 0
            except OSError:
                item["added_at"] = 0
        c = sgdb_cache.get(item["id"])
        if c is not None:
            # Le versioni precedenti salvavano poster/hero. Non segnare quei
            # record come completati: devono essere richiesti nel nuovo formato.
            item["sgdb_done"] = bool(c.get("cover") or c.get("background"))
            if c.get("background"):
                if not item.get("is_custom_background"):
                    item["banner_url"] = c["background"]
            if c.get("cover") and not item.get("is_custom_cover"):
                item["poster_url"] = c["cover"]

    return {
        "games": all_games,
        "total": len(all_games),
        "sgdb_enabled": bool((data.get("settings") or {}).get("sgdb_key"))
    }

@app.post("/api/rescan")
def rescan_games():
    refresh_games_cache()
    return get_games()

def _settings_with_defaults(data):
    st = json.loads(json.dumps(DEFAULT_DATA["settings"]))
    stored = data.get("settings") or {}
    for k, v in stored.items():
        if isinstance(v, dict) and isinstance(st.get(k), dict):
            st[k].update(v)
        else:
            st[k] = v
    return st


@app.get("/api/settings")
def get_settings():
    data = load_data()
    st = _settings_with_defaults(data)
    st["sgdb_enabled"] = bool(st.pop("sgdb_key", ""))
    st["itad_enabled"] = bool(st.pop("itad_key", ""))
    return st

@app.post("/api/settings")
def update_settings(payload: Dict[str, Any] = Body(...)):
    data = load_data()
    cur_settings = data.setdefault("settings", {})
    # la chiave SteamGridDB si cambia solo da /api/sgdb/key
    for k, v in payload.items():
        if k in ("sgdb_key", "sgdb_enabled", "itad_key", "itad_enabled"):
            continue            # le chiavi si cambiano solo dagli endpoint dedicati
        if isinstance(v, dict) and isinstance(cur_settings.get(k), dict):
            cur_settings[k].update(v)
        else:
            cur_settings[k] = v
    save_data(data)
    out = _settings_with_defaults(data)
    out["sgdb_enabled"] = bool(out.pop("sgdb_key", ""))
    out["itad_enabled"] = bool(out.pop("itad_key", ""))
    return {"status": "ok", "settings": out}

@app.post("/api/favorite")
def toggle_favorite(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("id")
    if not game_id:
        raise HTTPException(status_code=400, detail="Missing game id")
    
    data = load_data()
    favs = set(data.get("favorites", []))
    
    is_fav = payload.get("favorite")
    if is_fav is None:
        if game_id in favs:
            favs.remove(game_id)
            is_fav = False
        else:
            favs.add(game_id)
            is_fav = True
    else:
        if is_fav:
            favs.add(game_id)
        else:
            favs.discard(game_id)
            
    data["favorites"] = list(favs)
    save_data(data)
    return {"status": "ok", "id": game_id, "is_fav": is_fav}

@app.post("/api/launch")
def launch_game(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("id")
    if not game_id:
        raise HTTPException(status_code=400, detail="Missing game id")

    game = None
    data = load_data()
    for g in cached_games + data.get("custom_games", []):
        if g["id"] == game_id:
            game = g
            break

    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    launch_cmd = game.get("launch_cmd")
    launch_exe = game.get("launch_exe")
    
    try:
        if launch_cmd:
            os.startfile(launch_cmd)
        elif launch_exe and os.path.exists(launch_exe):
            if game.get("source") == "Custom":
                _start_file(launch_exe)
            else:
                subprocess.Popen([launch_exe], cwd=os.path.dirname(launch_exe) or None, shell=False)
        else:
            raise Exception("No valid executable or launch URI found")

        # Record play statistics only after the launcher accepted the request.
        now_ts = int(time.time())
        data.setdefault("last_played", {})[game_id] = now_ts
        cur_h = data.setdefault("playtime", {}).get(game_id, 0)
        data["playtime"][game_id] = round(cur_h + 1, 1) if cur_h > 0 else 1.0
        save_data(data)
            
        return {
            "status": "launched",
            "name": game.get("name"),
            "source": game.get("source"),
            "cmd": launch_cmd or launch_exe
        }
    except Exception as e:
        print("Launch failed:", e)
        raise HTTPException(status_code=500, detail=f"Failed to launch game: {str(e)}")

# ==================== COVER CUSTOMIZATION APIS ====================

@app.get("/api/game/covers")
def get_game_cover_options(id: str = Query(...)):
    data = load_data()
    custom_covers = data.get("custom_covers", {})
    
    target_game = None
    for g in cached_games + data.get("custom_games", []):
        if g["id"] == id:
            target_game = g
            break
            
    if not target_game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    game_name = target_game["name"]
    appid = target_game.get("appid")
    
    # 1. Build list of potential alternative online covers
    suggestions = []
    background_suggestions = []
    
    if appid:
        # Steam official assets
        suggestions.append({
            "title": "Steam Verticale Ufficiale (600x900)",
            "url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg"
        })
        suggestions.append({
            "title": "Steam Header Orizzontale",
            "url": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
        })
        background_suggestions.append({
            "title": "Steam Hero (sfondo widescreen)",
            "url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_hero.jpg"
        })
        suggestions.append({
            "title": "Steam Hero Banner",
            "url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_hero.jpg"
        })
    else:
        # For Epic Games or other titles, search Steam Store API for potential 600x900 poster
        if game_name in scanner.KNOWN_EPIC_ART and "poster_url" in scanner.KNOWN_EPIC_ART[game_name]:
            suggestions.append({
                "title": f"Poster Ufficiale {game_name}",
                "url": scanner.KNOWN_EPIC_ART[game_name]["poster_url"]
            })
        try:
            clean_q = urllib.parse.quote(game_name)
            res = requests.get(f"https://store.steampowered.com/api/storesearch/?term={clean_q}&l=italian&cc=IT", timeout=2.5)
            if res.ok:
                items = res.json().get("items", [])
                for it in items[:3]:
                    aid = it.get("id")
                    suggestions.append({
                        "title": f"Steam Art: {it.get('name')}",
                        "url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{aid}/library_600x900.jpg"
                    })
        except Exception:
            pass
            
    sg_key = (data.get("settings") or {}).get("sgdb_key")
    if sg_key:
        try:
            gid = (data.get("sgdb_cache", {}).get(id) or {}).get("gid") or sgdb.find_game_id(sg_key, game_name, appid)
            if gid:
                grid = [{"title": "SteamGridDB · copertina", "url": p["url"]} for p in sgdb.covers(sg_key, gid, 12)]
                suggestions = grid + suggestions
                backgrounds = [{"title": "SteamGridDB · sfondo", "url": p["url"]} for p in sgdb.backgrounds(sg_key, gid, 12)]
                background_suggestions = backgrounds + background_suggestions
        except Exception as e:
            print("SteamGridDB suggestions failed:", e)

    current_cover = custom_covers.get(id) or target_game.get("poster_url")
    current_background = data.get("custom_backgrounds", {}).get(id) or target_game.get("banner_url")
    is_custom = bool(custom_covers.get(id))
    # Look up original poster from cached_games
    default_cover = target_game.get("poster_url")
    for cg in cached_games:
        if cg["id"] == id:
            default_cover = cg.get("poster_url")
            break
    if not default_cover and appid:
        default_cover = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg"

    return {
        "id": id,
        "name": game_name,
        "current_cover": current_cover,
        "cover_position": data.get("cover_positions", {}).get(id, {"x": 50, "y": 25}),
        "is_custom": is_custom,
        "default_cover": default_cover,
        "current_background": current_background,
        "default_background": target_game.get("banner_url"),
        "art_style": target_game.get("art_style"),
        "palette": target_game.get("palette"),
        "suggestions": suggestions,
        "background_suggestions": background_suggestions
    }

@app.post("/api/game/cover")
def set_game_cover(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("id")
    cover_url = payload.get("cover_url")
    if not game_id or not cover_url:
        raise HTTPException(status_code=400, detail="Missing game id or cover_url")
        
    data = load_data()
    data.setdefault("custom_covers", {})[game_id] = cover_url.strip()
    save_data(data)
    return {"status": "ok", "id": game_id, "cover_url": cover_url}


@app.post("/api/game/cover/position")
def set_game_cover_position(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("id")
    if not game_id:
        raise HTTPException(status_code=400, detail="Missing game id")
    try:
        x = max(0, min(100, float(payload.get("x", 50))))
        y = max(0, min(100, float(payload.get("y", 25))))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid cover position")
    data = load_data()
    data.setdefault("cover_positions", {})[game_id] = {"x": x, "y": y}
    save_data(data)
    return {"status": "ok", "id": game_id, "cover_position": {"x": x, "y": y}}


@app.post("/api/game/background")
def set_game_background(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("id")
    background_url = payload.get("background_url")
    if not game_id or not background_url:
        raise HTTPException(status_code=400, detail="Missing game id or background_url")
    data = load_data()
    data.setdefault("custom_backgrounds", {})[game_id] = background_url.strip()
    save_data(data)
    return {"status": "ok", "id": game_id, "background_url": background_url}

@app.post("/api/game/cover/reset")
def reset_game_cover(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("id")
    if not game_id:
        raise HTTPException(status_code=400, detail="Missing game id")
        
    data = load_data()
    if "custom_covers" in data and game_id in data["custom_covers"]:
        del data["custom_covers"][game_id]
    data.setdefault("cover_positions", {}).pop(game_id, None)
    save_data(data)

    default_cover = None
    for g in cached_games + data.get("custom_games", []):
        if g["id"] == game_id:
            default_cover = g.get("poster_url")
            break

    return {"status": "ok", "id": game_id, "default_cover": default_cover}


@app.post("/api/game/background/reset")
def reset_game_background(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("id")
    if not game_id:
        raise HTTPException(status_code=400, detail="Missing game id")
    data = load_data()
    data.setdefault("custom_backgrounds", {}).pop(game_id, None)
    save_data(data)
    default_background = None
    for g in cached_games + data.get("custom_games", []):
        if g["id"] == game_id:
            default_background = g.get("banner_url")
            break
    return {"status": "ok", "id": game_id, "default_background": default_background}

@app.post("/api/game/cover/browse")
def browse_game_cover(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("id")
    kind = payload.get("kind", "cover")
    if not game_id:
        raise HTTPException(status_code=400, detail="Missing game id")
        
    file_path = None
    try:
        if file_dialog_hook is not None:
            # Finestra di dialogo nativa di pywebview (impostata da main.py)
            file_path = file_dialog_hook("image")
        else:
            # Fallback per l'esecuzione diretta di server.py senza finestra
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            root.update()
            try:
                file_path = filedialog.askopenfilename(
                    title="Seleziona un'immagine per il gioco",
                    filetypes=[
                        ("File Immagine", "*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.gif"),
                        ("Tutti i file", "*.*")
                    ]
                )
            finally:
                try:
                    root.destroy()
                except Exception:
                    pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File dialog error: {e}")
        
    if not file_path or not os.path.exists(file_path):
        return {"status": "cancelled"}
        
    ext = os.path.splitext(file_path)[1].lower() or ".jpg"
    filename = f"{game_id}_{int(time.time())}{ext}"
    dest = os.path.join(COVERS_DIR, filename)
    shutil.copy2(file_path, dest)
    
    local_url = f"/covers/{filename}"
    data = load_data()
    if kind == "background":
        data.setdefault("custom_backgrounds", {})[game_id] = local_url
    else:
        data.setdefault("custom_covers", {})[game_id] = local_url
    save_data(data)
    return {
        "status": "ok",
        "id": game_id,
        "background_url" if kind == "background" else "cover_url": local_url,
    }

# ==================================================================

@app.get("/api/stats")
def get_stats():
    data = load_data()
    games = cached_games + data.get("custom_games", [])
    favs = set(data.get("favorites", []))
    playtimes = data.get("playtime", {})
    last_played = data.get("last_played", {})
    custom_covers = data.get("custom_covers", {})
    
    total_hours = sum(playtimes.values())
    source_hours = {"Steam": 0, "Epic Games": 0, "Custom": 0}
    for g in games:
        src = g.get("source", "Custom")
        h = playtimes.get(g["id"], 0)
        if src in source_hours:
            source_hours[src] += h
        else:
            source_hours[src] = h
            
    recent = []
    for g in games:
        lp = last_played.get(g["id"], g.get("last_played", 0))
        if lp > 0:
            cover = custom_covers.get(g["id"]) or g.get("poster_url")
            recent.append({
                "id": g["id"],
                "name": g["name"],
                "source": g.get("source"),
                "last_played": lp,
                "poster_url": cover,
                "art_style": g.get("art_style"),
                "palette": g.get("palette")
            })
    recent.sort(key=lambda x: x["last_played"], reverse=True)
    
    return {
        "total_games": len(games),
        "total_favorites": len(favs),
        "total_hours": round(total_hours, 1),
        "source_hours": source_hours,
        "recent_games": recent[:5]
    }

@app.get("/api/telemetry")
def get_telemetry():
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=None)
        ram = psutil.virtual_memory()
        return {
            "cpu_percent": round(cpu, 1),
            "ram_percent": round(ram.percent, 1),
            "ram_used_gb": round(ram.used / (1024**3), 1),
            "ram_total_gb": round(ram.total / (1024**3), 1)
        }
    except Exception:
        return {
            "cpu_percent": 15.0,
            "ram_percent": 40.0,
            "ram_used_gb": 6.5,
            "ram_total_gb": 16.0
        }

# ---------------------------------------------------------------------------
# Media (Spotify & co.) tramite Windows "Global System Media Transport Controls"
# Richiede:  pip install winrt-runtime winrt-Windows.Media.Control
#            winrt-Windows.Storage.Streams winrt-Windows.Foundation
#            winrt-Windows.Foundation.Collections
# Se i pacchetti mancano (o non sei su Windows) il widget mostra "non disponibile".
# ---------------------------------------------------------------------------
_thumb_cache: Dict[str, Any] = {"key": None, "data": None, "mime": "image/jpeg"}

async def _media_session():
    from winrt.windows.media.control import (
        GlobalSystemMediaTransportControlsSessionManager as MediaManager,
    )
    mgr = await MediaManager.request_async()
    for s in mgr.get_sessions():
        if "spotify" in (s.source_app_user_model_id or "").lower():
            return s
    # This widget is specifically for Spotify. Do not fall back to the
    # current Windows media session: FEYORA's ambient audio is also exposed
    # by WebView2 and must not appear as a track in the bottom player.
    return None

@app.get("/api/media")
async def get_media():
    try:
        sess = await _media_session()
    except Exception as e:
        return {"available": False, "reason": f"{type(e).__name__}"}
    if sess is None:
        return {"available": True, "active": False}
    try:
        props = await sess.try_get_media_properties_async()
        pb = sess.get_playback_info()
        tl = sess.get_timeline_properties()
        key = f"{props.artist}|{props.album_title}|{props.title}"
        if props.thumbnail is not None and _thumb_cache["key"] != key:
            try:
                from winrt.windows.storage.streams import Buffer, InputStreamOptions
                stream = await props.thumbnail.open_read_async()
                buf = Buffer(stream.size)
                await stream.read_async(buf, stream.size, InputStreamOptions.READ_AHEAD)
                _thumb_cache.update(key=key, data=bytes(memoryview(buf)),
                                    mime=stream.content_type or "image/jpeg")
            except Exception:
                _thumb_cache.update(key=key, data=None)
        is_playing = False
        try:
            if pb and hasattr(pb, 'playback_status'):
                is_playing = int(pb.playback_status) == 4
        except Exception:
            pass

        pos_sec = 0.0
        dur_sec = 0.0
        try:
            if tl and hasattr(tl, 'position') and tl.position:
                pos_sec = tl.position.total_seconds()
            if tl and hasattr(tl, 'end_time') and tl.end_time:
                dur_sec = tl.end_time.total_seconds()
        except Exception:
            pass

        return {
            "available": True,
            "active": True,
            "app": (sess.source_app_user_model_id or "").replace(".exe", ""),
            "title": props.title or "",
            "artist": props.artist or "",
            "album": props.album_title or "",
            "playing": is_playing,
            "position": pos_sec,
            "duration": dur_sec,
            "has_thumb": bool(_thumb_cache["data"]) and _thumb_cache["key"] == key,
            "key": key,
        }
    except Exception as e:
        return {"available": True, "active": False, "reason": f"{type(e).__name__}"}

@app.get("/api/media/thumb")
def get_media_thumb():
    from fastapi.responses import Response
    if not _thumb_cache["data"]:
        return Response(status_code=404)
    return Response(content=_thumb_cache["data"], media_type=_thumb_cache["mime"])

@app.post("/api/media/control")
async def media_control(payload: Dict[str, Any] = Body(...)):
    cmd = payload.get("cmd")
    try:
        sess = await _media_session()
        if sess is None:
            return {"ok": False}
        if cmd == "toggle":
            await sess.try_toggle_play_pause_async()
        elif cmd == "next":
            await sess.try_skip_next_async()
        elif cmd == "prev":
            await sess.try_skip_previous_async()
        else:
            return {"ok": False}
        return {"ok": True}
    except Exception:
        return {"ok": False}

OPEN_HOSTS = {
    "store.steampowered.com", "steamcommunity.com",
    "store.epicgames.com", "epicgames.com", "www.epicgames.com",
    "xbox.com", "www.xbox.com",
    "microsoft.com", "www.microsoft.com", "apps.microsoft.com",
}

@app.post("/api/launcher/install")
def install_launcher(payload: Dict[str, Any] = Body(...)):
    """Opens the official installer/download page for a missing launcher."""
    key = str(payload.get("launcher") or "").lower()
    url = scanner.LAUNCHER_INSTALLERS.get(key)
    if not url:
        raise HTTPException(status_code=400, detail="Launcher non supportato")
    detected = next((item for item in scanner.scan_default_launchers() if item.get("launcher_key") == key), None)
    if detected and not detected.get("launcher_missing"):
        raise HTTPException(status_code=409, detail="Launcher già installato")
    try:
        _open_uri(url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Impossibile aprire il download: {e}")
    return {"ok": True, "launcher": key, "url": url}

@app.post("/api/open")
def open_external(payload: Dict[str, Any] = Body(...)):
    """Apre Spotify, Discord, il browser o la pagina di uno store (solo target/host in whitelist)."""
    uris = {"spotify": "spotify:", "discord": "discord://", "browser": "https://www.google.com"}
    url = payload.get("url")
    if url:
        p = urllib.parse.urlparse(str(url))
        hostname = (p.hostname or "").lower().rstrip(".")
        allowed = hostname in OPEN_HOSTS or any(hostname.endswith("." + host) for host in OPEN_HOSTS)
        if p.scheme.lower() not in {"http", "https"} or not allowed:
            return {"ok": False}
        uri = str(url)
    else:
        uri = uris.get(payload.get("target"))
    if not uri:
        return {"ok": False}
    try:
        _open_uri(uri)
        return {"ok": True}
    except Exception:
        return {"ok": False}

# ==================== STEAMGRIDDB ====================

@app.post("/api/sgdb/key")
def sgdb_set_key(payload: Dict[str, Any] = Body(...)):
    key = (payload.get("key") or "").strip()
    data = load_data()
    st = data.setdefault("settings", {})
    if not key:
        st["sgdb_key"] = ""
        save_data(data)
        return {"ok": True, "enabled": False}
    try:
        sgdb.validate(key)
    except sgdb.SgdbError as e:
        return {"ok": False, "error": str(e)}
    except Exception:
        return {"ok": False, "error": "Impossibile contattare SteamGridDB (sei online?)"}
    st["sgdb_key"] = key
    save_data(data)
    return {"ok": True, "enabled": True}

@app.get("/api/sgdb/art")
def sgdb_art(id: str = Query(...), force: bool = False):
    """Cover e sfondo di un gioco da SteamGridDB, con cache su disco."""
    data = load_data()
    key = (data.get("settings") or {}).get("sgdb_key")
    if not key:
        return {"enabled": False}
    cache = data.setdefault("sgdb_cache", {})
    hit = cache.get(id)
    # Riusa solo una cache completa. Una risposta parziale (o vuota) deve
    # poter essere ritentata, altrimenti un errore temporaneo di SGDB resta
    # invisibile fino alla scadenza della cache.
    cache_complete = bool(hit and hit.get("cover") and hit.get("background"))
    if cache_complete and not force and time.time() - hit.get("ts", 0) < 7 * 86400:
        return {"enabled": True, **hit}
    game = next((g for g in cached_games + data.get("custom_games", []) if g["id"] == id), None)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    try:
        art = sgdb.art_for(key, game["name"], game.get("appid"))
    except sgdb.SgdbError as e:
        return {"enabled": True, "error": str(e)}
    except Exception:
        return {"enabled": True, "error": "offline"}   # niente cache: si riprova al prossimo avvio
    art["ts"] = int(time.time())
    cache[id] = art
    save_data(data)
    return {"enabled": True, **art}

# ==================== APP / GIOCHI PERSONALIZZATI ====================

@app.post("/api/custom/add")
def custom_add(payload: Dict[str, Any] = Body(...)):
    path = (payload.get("path") or "").strip()
    if not path:
        if file_dialog_hook is None:
            raise HTTPException(status_code=400, detail="Selettore file non disponibile")
        try:
            path = file_dialog_hook("exe") or ""
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"File dialog error: {e}")
    if not path:
        return {"status": "cancelled"}
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="File non trovato")
    name = (payload.get("name") or "").strip() or _pretty_name(path)
    gid = "custom_" + hashlib.sha1(os.path.normcase(path).encode("utf-8")).hexdigest()[:10]
    data = load_data()
    customs = data.setdefault("custom_games", [])
    if any(g.get("id") == gid for g in customs):
        return {"status": "exists", "id": gid, "name": name}
    art_style, palette = scanner.get_procedural_meta(name)
    customs.append({
        "id": gid, "name": name, "source": "Custom", "launch_exe": path,
        "install_path": os.path.dirname(path), "size_bytes": 0,
        "art_style": art_style, "palette": palette,
        "poster_url": None, "banner_url": None, "appid": None,
        "added_at": int(time.time()),
    })
    save_data(data)
    return {"status": "ok", "id": gid, "name": name}

@app.post("/api/custom/remove")
def custom_remove(payload: Dict[str, Any] = Body(...)):
    gid = payload.get("id")
    data = load_data()
    before = len(data.get("custom_games", []))
    data["custom_games"] = [g for g in data.get("custom_games", []) if g.get("id") != gid]
    if len(data["custom_games"]) == before:
        raise HTTPException(status_code=404, detail="Custom game not found")
    data["favorites"] = [f for f in data.get("favorites", []) if f != gid]
    for k in ("custom_covers", "cover_positions", "custom_backgrounds", "playtime", "last_played", "sgdb_cache"):
        data.get(k, {}).pop(gid, None)
    save_data(data)
    return {"status": "ok", "id": gid}

# ==================== STORE / COMPARATORE PREZZI ====================

def _store_opts():
    settings = _settings_with_defaults(load_data())
    settings["store_favorites"] = settings.get("store_favorites") or []
    return store.make_opts(settings)


@app.get("/api/store/home")
def store_home(refresh: bool = False):
    if refresh:
        store.clear_cache()
    return store.home(_store_opts())

@app.get("/api/store/search")
def store_search(q: str = Query("")):
    return store.search(q, _store_opts())

@app.get("/api/store/diagnose")
def store_diagnose():
    store.clear_cache()
    return store.diagnose(_store_opts())

@app.post("/api/itad/key")
def itad_set_key(payload: Dict[str, Any] = Body(...)):
    key = (payload.get("key") or "").strip()
    data = load_data()
    st = data.setdefault("settings", {})
    if not key:
        st["itad_key"] = ""
        save_data(data)
        store.clear_cache()
        return {"ok": True, "enabled": False}
    opts = store.make_opts(dict(_settings_with_defaults(data), itad_key=key))
    try:
        store.itad_search("portal", opts, 1)
    except store.StoreError as e:
        return {"ok": False, "error": str(e) if "HTTP" in str(e) or "timeout" in str(e) else "Chiave non valida o servizio non raggiungibile: " + str(e)}
    except Exception as e:
        return {"ok": False, "error": f"Errore: {e}"}
    st["itad_key"] = key
    save_data(data)
    store.clear_cache()
    return {"ok": True, "enabled": True}

# ==================== SISTEMA ====================

try:
    import winreg as _winreg
except ImportError:  # non Windows
    _winreg = None
_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_VERSION = "3.0.0"


def _autostart_cmd():
    if paths.FROZEN:
        return f'"{sys.executable}"'
    exe = sys.executable
    pyw = exe[:-10] + "pythonw.exe" if exe.lower().endswith("python.exe") else exe
    return f'"{pyw}" "{os.path.join(paths.RES_DIR, "main.py")}"'


@app.get("/api/system/info")
def system_info():
    return {"version": APP_VERSION, "frozen": paths.FROZEN, "data_dir": paths.DATA_DIR, "log_file": paths.LOG_FILE,
            "platform": sys.platform, "python": sys.version.split()[0], "games": len(cached_games),
            "autostart_supported": bool(_winreg and sys.platform == "win32")}


@app.get("/api/system/autostart")
def autostart_get():
    if not (_winreg and sys.platform == "win32"):
        return {"supported": False, "enabled": False}
    try:
        with _winreg.OpenKey(_winreg.HKEY_CURRENT_USER, _RUN_KEY) as k:
            _winreg.QueryValueEx(k, "FEYORA")
        return {"supported": True, "enabled": True}
    except OSError:
        return {"supported": True, "enabled": False}


@app.post("/api/system/autostart")
def autostart_set(payload: Dict[str, Any] = Body(...)):
    if not (_winreg and sys.platform == "win32"):
        raise HTTPException(status_code=400, detail="Disponibile solo su Windows")
    enable = bool(payload.get("enabled"))
    try:
        with _winreg.OpenKey(_winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, _winreg.KEY_SET_VALUE) as k:
            if enable:
                _winreg.SetValueEx(k, "FEYORA", 0, _winreg.REG_SZ, _autostart_cmd())
            else:
                try:
                    _winreg.DeleteValue(k, "FEYORA")
                except FileNotFoundError:
                    pass
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"supported": True, "enabled": enable}


@app.post("/api/system/open-data-folder")
def open_data_folder():
    try:
        _open_uri(paths.DATA_DIR)
        return {"ok": True}
    except Exception:
        return {"ok": False}


@app.post("/api/system/clear-cache")
def clear_cache():
    data = load_data()
    n = len(data.get("sgdb_cache", {}))
    data["sgdb_cache"] = {}
    save_data(data)
    store.clear_cache()
    return {"ok": True, "cleared": n}


@app.post("/api/system/reset-settings")
def reset_settings():
    data = load_data()
    old = data.get("settings") or {}
    fresh = json.loads(json.dumps(DEFAULT_DATA["settings"]))
    for k in ("sgdb_key", "itad_key", "nick"):      # chiavi e nome profilo si conservano
        if old.get(k):
            fresh[k] = old[k]
    data["settings"] = fresh
    save_data(data)
    out = _settings_with_defaults(data)
    out["sgdb_enabled"] = bool(out.pop("sgdb_key", ""))
    out["itad_enabled"] = bool(out.pop("itad_key", ""))
    return {"ok": True, "settings": out}

@app.post("/api/quit")
def quit_app():
    def _shutdown():
        time.sleep(0.4)
        os._exit(0)
    import threading
    threading.Thread(target=_shutdown).start()
    return {"status": "shutting_down"}

# Serve static files and covers
app.mount("/covers", StaticFiles(directory=COVERS_DIR), name="covers")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_root(t: Optional[str] = Query(None)):
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        resp = FileResponse(index_file)
        if SESSION_TOKEN and t and secrets.compare_digest(t.encode("utf-8"), SESSION_TOKEN.encode("utf-8")):
            resp.set_cookie(SESSION_COOKIE, SESSION_TOKEN, httponly=True, samesite="strict", path="/")
        return resp
    return {"message": "FEYORA Launcher is running."}

if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, log_level="info")
