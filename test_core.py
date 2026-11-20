import os
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import scanner
import server
import store


class LauncherDiscoveryTests(unittest.TestCase):
    def test_missing_launchers_expose_official_install_action(self):
        with patch.object(scanner, "_detect_steam_exe", return_value=None), \
             patch.object(scanner, "_detect_epic_exe", return_value=None):
            launchers = scanner.scan_default_launchers()

        self.assertEqual({item["launcher_key"] for item in launchers}, {"steam", "epic"})
        for item in launchers:
            self.assertTrue(item["launcher_missing"])
            self.assertIsNone(item["launch_cmd"])
            self.assertTrue(item["install_url"].startswith("https://"))

    def test_installed_launcher_exposes_executable_and_launch_uri(self):
        with patch.object(scanner, "_detect_steam_exe", return_value=r"C:\Steam\steam.exe"), \
             patch.object(scanner, "_detect_epic_exe", return_value=r"C:\Epic\EpicGamesLauncher.exe"):
            launchers = scanner.scan_default_launchers()

        for item in launchers:
            self.assertFalse(item["launcher_missing"])
            self.assertTrue(item["launch_exe"].lower().endswith(".exe"))
            self.assertTrue(item["launch_cmd"])
            self.assertIsNone(item["install_url"])


class StoreCacheTests(unittest.TestCase):
    def test_concurrent_requests_are_deduplicated(self):
        store.clear_cache()
        calls = [0]
        lock = threading.Lock()

        def load():
            with lock:
                calls[0] += 1
            time.sleep(0.05)
            return "value"

        with ThreadPoolExecutor(max_workers=6) as pool:
            result = list(pool.map(lambda _: store.cached(("test",), 30, load), range(6)))

        self.assertEqual(calls[0], 1)
        self.assertEqual(result, ["value"] * 6)

    def test_expired_entry_is_reloaded(self):
        store.clear_cache()
        calls = [0]

        def load():
            calls[0] += 1
            return calls[0]

        self.assertEqual(store.cached(("ttl",), 0.01, load), 1)
        time.sleep(0.02)
        self.assertEqual(store.cached(("ttl",), 0.01, load), 2)


class DataPersistenceTests(unittest.TestCase):
    def test_save_and_load_use_valid_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_file = os.path.join(temp_dir, "launcher_data.json")
            with patch.object(server, "DATA_FILE", data_file):
                payload = {"settings": {"lang": "it"}, "favorites": ["launcher_steam"]}
                server.save_data(payload)
                self.assertTrue(os.path.isfile(data_file))
                self.assertEqual(server.load_data()["favorites"], ["launcher_steam"])


if __name__ == "__main__":
    unittest.main()
