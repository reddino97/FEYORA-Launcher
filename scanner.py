import os
import glob
import json
import re
import winreg
import hashlib

# Procedural art styles and palettes inspired by FEYORA
ART_STYLES = ['waves', 'city', 'rings', 'sun', 'forest', 'mountains', 'bubbles', 'stripes']
PALETTES = [
    ['#0d2b45', '#1b6f8a', '#7fe0d0', '#f2c46d'],
    ['#2b1220', '#7a2e3a', '#e5894f', '#f6d9a8'],
    ['#150f33', '#4b3aa8', '#a98bff', '#ffd1f0'],
    ['#1d2a14', '#5c9a3a', '#d8e86a', '#ff8c5a'],
    ['#0e1f1c', '#1f5a4a', '#6fbf8e', '#ffd36b'],
    ['#2a1a0f', '#8a4a22', '#e0a458', '#fbe7c0'],
    ['#10223a', '#2a5fa8', '#6cc3ff', '#ff9fb2'],
    ['#111118', '#3a3a58', '#9b9bd6', '#ff4d6d'],
    ['#1c102a', '#54267e', '#b854d4', '#4deeea'],
    ['#1e140d', '#61381c', '#d67c38', '#ffe066']
]

# Known posters & palettes for Epic Games titles
KNOWN_EPIC_ART = {
    'Fortnite': {
        'poster_url': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2k1e.jpg',
        'banner_url': 'https://cdn2.unrealengine.com/16br-delayed-social-share-image-1920x1080-1920x1080-877717646.jpg',
        'palette': ['#091736', '#143f85', '#33b5e5', '#ffeb3b']
    },
    'Rocket League': {
        'poster_url': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1x4e.jpg',
        'banner_url': 'https://images.igdb.com/igdb/image/upload/t_1080p/co1x4e.jpg',
        'palette': ['#0c1b33', '#1e4b8a', '#00b4d8', '#ffb703']
    },
    'Caravan SandWitch': {
        'poster_url': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1582650/library_600x900.jpg',
        'banner_url': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1582650/library_hero.jpg',
        'palette': ['#2d1b10', '#8a4f2b', '#e28743', '#fbe8a6']
    }
}

def get_procedural_meta(name: str):
    """Generates consistent procedural artwork type & color palette from game name hash."""
    h = int(hashlib.md5(name.encode('utf-8', errors='ignore')).hexdigest(), 16)
    art_style = ART_STYLES[h % len(ART_STYLES)]
    palette = PALETTES[(h // len(ART_STYLES)) % len(PALETTES)]
    return art_style, palette

def get_steam_libraries():
    """Detects Steam install path and all configured steam library folders."""
    steam_path = None
    # 1. Registry HKCU
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as key:
            val, _ = winreg.QueryValueEx(key, "SteamPath")
            if val and os.path.exists(val):
                steam_path = os.path.abspath(val.replace("/", "\\"))
    except Exception:
        pass
    
    # 2. Registry HKLM
    if not steam_path:
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam") as key:
                val, _ = winreg.QueryValueEx(key, "InstallPath")
                if val and os.path.exists(val):
                    steam_path = os.path.abspath(val.replace("/", "\\"))
        except Exception:
            pass

    # 3. Default folder
    if not steam_path:
        default_p = r"C:\Program Files (x86)\Steam"
        if os.path.exists(default_p):
            steam_path = os.path.abspath(default_p)

    if not steam_path:
        return None, []

    libraries_set = {os.path.normcase(os.path.abspath(os.path.join(steam_path, "steamapps")))}
    vdf_path = os.path.join(steam_path, "steamapps", "libraryfolders.vdf")
    
    if os.path.exists(vdf_path):
        try:
            with open(vdf_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            for m in re.finditer(r'"path"\s+"([^"]+)"', content):
                p = m.group(1).replace("\\\\", "\\")
                sa = os.path.normcase(os.path.abspath(os.path.join(p, "steamapps")))
                if os.path.exists(sa):
                    libraries_set.add(sa)
        except Exception as e:
            print("Error parsing libraryfolders.vdf:", e)

    return steam_path, list(libraries_set)

def scan_steam_games():
    """Scans all installed Steam games from all steam library folders."""
    steam_path, libs = get_steam_libraries()
    if not libs:
        return []

    games = []
    seen_appids = set()
    ignored_appids = {
        "228980", "250820", "1391110", "1070560", "1628350", "3658110"
    } # Common redistributables, runtimes, VR tools

    for lib in libs:
        for acf_file in glob.glob(os.path.join(lib, "appmanifest_*.acf")):
            try:
                with open(acf_file, "r", encoding="utf-8", errors="ignore") as f:
                    txt = f.read()
                appid_m = re.search(r'"appid"\s+"(\d+)"', txt)
                name_m = re.search(r'"name"\s+"([^"]+)"', txt)
                installdir_m = re.search(r'"installdir"\s+"([^"]+)"', txt)
                last_played_m = re.search(r'"LastPlayed"\s+"(\d+)"', txt)
                size_m = re.search(r'"SizeOnDisk"\s+"(\d+)"', txt)
                
                if appid_m and name_m:
                    appid = appid_m.group(1)
                    if appid in seen_appids or appid in ignored_appids:
                        continue
                    
                    name = name_m.group(1).strip()
                    # Skip common runtime / compatibility tools
                    if any(name.startswith(prefix) for prefix in [
                        "Steam Linux Runtime", "Proton ", "SteamVR", "Steamworks Common"
                    ]):
                        continue

                    seen_appids.add(appid)
                    installdir = installdir_m.group(1) if installdir_m else ""
                    last_played = int(last_played_m.group(1)) if last_played_m else 0
                    size = int(size_m.group(1)) if size_m else 0
                    
                    # Check local cover image in Steam appcache
                    local_art = None
                    if steam_path:
                        art_candidates = [
                            os.path.join(steam_path, "appcache", "librarycache", f"{appid}_library_600x900.jpg"),
                            os.path.join(steam_path, "appcache", "librarycache", f"{appid}_library_hero.jpg"),
                            os.path.join(steam_path, "appcache", "librarycache", f"{appid}_header.jpg")
                        ]
                        for c in art_candidates:
                            if os.path.exists(c):
                                local_art = c
                                break

                    art_style, palette = get_procedural_meta(name)

                    games.append({
                        "id": f"steam_{appid}",
                        "name": name,
                        "source": "Steam",
                        "category": "steam",
                        "appid": appid,
                        "install_path": os.path.join(lib, "common", installdir) if installdir else "",
                        "last_played": last_played,
                        "size_bytes": size,
                        "local_art": local_art,
                        "poster_url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg",
                        "banner_url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_hero.jpg",
                        "launch_cmd": f"steam://rungameid/{appid}",
                        "art_style": art_style,
                        "palette": palette
                    })
            except Exception as e:
                print(f"Error reading Steam acf file {acf_file}: {e}")
                
    # Sort recently played first
    games.sort(key=lambda g: g.get("last_played", 0), reverse=True)
    return games

def clean_game_name(name: str) -> str:
    """Removes weird encoding artifacts like trade symbols or replacement chars."""
    if not name:
        return ""
    cleaned = re.sub(r'[\ufffd\xae\u2122\x99]', '', name)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned)
    return cleaned.strip()

def scan_epic_games():
    """Scans all installed Epic Games from Epic manifests."""
    manifests_dir = r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests"
    games = []
    if not os.path.exists(manifests_dir):
        return games

    seen_app_names = set()

    for item_file in glob.glob(os.path.join(manifests_dir, "*.item")):
        try:
            with open(item_file, "r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
            
            # Filter DLCs or secondary packages
            main_app = data.get("MainGameAppName")
            if main_app:
                continue
            
            is_app = data.get("bIsApplication", True)
            if not is_app:
                continue
                
            app_name = data.get("AppName")
            if not app_name or app_name in seen_app_names:
                continue
            
            seen_app_names.add(app_name)
            raw_title = data.get("DisplayName", app_name)
            name = clean_game_name(raw_title)

            # Skip DLCs that slipped through
            if name.lower().startswith("contenuti di ") or "dlc" in name.lower():
                continue

            install_loc = data.get("InstallLocation", "")
            launch_exe = data.get("LaunchExecutable", "")
            full_exe = os.path.join(install_loc, launch_exe) if install_loc and launch_exe else ""
            
            art_style, palette = get_procedural_meta(name)
            poster_url = None
            banner_url = None
            if name in KNOWN_EPIC_ART:
                meta = KNOWN_EPIC_ART[name]
                if 'palette' in meta:
                    palette = meta['palette']
                if 'poster_url' in meta:
                    poster_url = meta['poster_url']
                if 'banner_url' in meta:
                    banner_url = meta['banner_url']

            games.append({
                "id": f"epic_{app_name}",
                "name": name,
                "source": "Epic Games",
                "category": "epic",
                "app_name": app_name,
                "install_path": install_loc,
                "launch_exe": full_exe,
                "launch_cmd": f"com.epicgames.launcher://apps/{app_name}?action=launch&silent=true",
                "poster_url": poster_url,
                "banner_url": banner_url,
                "art_style": art_style,
                "palette": palette,
                "last_played": 0,
                "size_bytes": 0
            })
        except Exception as e:
            print(f"Error parsing Epic manifest {item_file}: {e}")
            
    return games

def scan_all_games():
    """Scans launchers and installed games from Steam and Epic Games."""
    launchers = scan_default_launchers()
    steam = scan_steam_games()
    epic = scan_epic_games()
    return launchers + steam + epic


LAUNCHER_INSTALLERS = {
    # Steam provides a stable bootstrapper URL; Epic's official download page
    # keeps the installer current and handles its own architecture selection.
    "steam": "https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe",
    "epic": "https://store.epicgames.com/download",
}


def _first_existing(paths):
    for path in paths:
        if path and os.path.isfile(path):
            return os.path.abspath(path)
    return None


def _registry_value(root, key_path, value_name, view=None):
    try:
        flags = winreg.KEY_READ | (view or 0)
        with winreg.OpenKey(root, key_path, 0, flags) as key:
            value, _ = winreg.QueryValueEx(key, value_name)
            return value if isinstance(value, str) else None
    except (FileNotFoundError, OSError):
        return None


def _detect_steam_exe():
    candidates = [
        _registry_value(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamExe"),
        _registry_value(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        _registry_value(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
        os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Steam", "steam.exe"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Steam", "steam.exe"),
    ]
    normalized = []
    for candidate in candidates:
        if candidate:
            normalized.append(candidate if os.path.splitext(candidate)[1] else os.path.join(candidate, "steam.exe"))
    return _first_existing(normalized)


def _detect_epic_exe():
    candidates = [
        _registry_value(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Epic Games\EpicGamesLauncher", "AppDataPath"),
        _registry_value(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Epic Games\EpicGamesLauncher", "AppDataPath"),
        os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Epic Games", "Launcher", "Portal", "Binaries", "Win64", "EpicGamesLauncher.exe"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Epic Games", "Launcher", "Portal", "Binaries", "Win64", "EpicGamesLauncher.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Epic Games", "Launcher", "Portal", "Binaries", "Win64", "EpicGamesLauncher.exe"),
    ]
    normalized = []
    for candidate in candidates:
        if candidate:
            normalized.append(candidate if candidate.lower().endswith(".exe") else os.path.join(candidate, "Launcher", "Portal", "Binaries", "Win64", "EpicGamesLauncher.exe"))
    return _first_existing(normalized)


def scan_default_launchers():
    """Returns Steam/Epic as library apps, including install actions when absent."""
    detected = {
        "steam": ("Steam", _detect_steam_exe(), "steam:", "desktop_windows"),
        "epic": ("Epic Games", _detect_epic_exe(), "com.epicgames.launcher://", "storefront"),
    }
    result = []
    for key, (name, exe, launch_uri, icon) in detected.items():
        result.append({
            "id": f"launcher_{key}",
            "name": name,
            "source": "Launcher",
            "category": "apps",
            "launcher_key": key,
            "launcher_icon": icon,
            "launcher_missing": not bool(exe),
            "launch_exe": exe,
            "launch_cmd": launch_uri if exe else None,
            "install_url": LAUNCHER_INSTALLERS[key] if not exe else None,
            "install_path": os.path.dirname(exe) if exe else "",
            "last_played": 0,
            "size_bytes": 0,
            "poster_url": None,
            "banner_url": None,
            "art_style": "rings",
            "palette": ["#14213d", "#274c77", "#7fc8f8", "#fca311"],
        })
    return result
