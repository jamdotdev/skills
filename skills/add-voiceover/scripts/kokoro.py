"""Speak stdin into a .wav with Kokoro, a local text-to-speech model (Apache-2.0).

usage: uv run --python 3.12 --with kokoro-onnx --with soundfile python kokoro.py <out.wav>
       python3 kokoro.py --install    downloads the model, about 340 MB, once; ask the user first
KOKORO_VOICE picks the voice (default am_michael; af_heart, bf_emma, bm_george and others).
"""
import os, sys, urllib.request
from pathlib import Path

cache = Path(os.environ.get("KOKORO_DIR", Path.home() / ".cache" / "kokoro"))
release = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
files = ("kokoro-v1.0.onnx", "voices-v1.0.bin")
if sys.argv[1] == "--install":
    cache.mkdir(parents=True, exist_ok=True)
    for name in files:
        if not (cache / name).exists():
            print(f"downloading {name} to {cache}", file=sys.stderr)
            urllib.request.urlretrieve(release + name, cache / f"{name}.part")
            (cache / f"{name}.part").rename(cache / name)
    sys.exit()
if not all((cache / name).exists() for name in files):
    sys.exit(f"Kokoro model not in {cache}; run kokoro.py --install")

import soundfile
from kokoro_onnx import Kokoro

kokoro = Kokoro(str(cache / "kokoro-v1.0.onnx"), str(cache / "voices-v1.0.bin"))
samples, rate = kokoro.create(sys.stdin.read().strip(), voice=os.environ.get("KOKORO_VOICE", "am_michael"), lang="en-us")
soundfile.write(sys.argv[1], samples, rate)
