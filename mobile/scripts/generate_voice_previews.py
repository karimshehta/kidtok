"""Generate the short, spoken voice previews used in KidTok's avatar picker.

The generated files are product UI previews only. They use the open Piper
Arabic voice locally; no child audio or account data is sent to a service.

One-time setup (outside the mobile app):
    pip install piper-tts numpy

Then run:
    python scripts/generate_voice_previews.py --model-dir C:\\temp\\kidtok-piper-model
"""

from __future__ import annotations

import argparse
import math
import urllib.request
import wave
from pathlib import Path

import numpy as np
from piper.voice import PiperVoice


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "sounds" / "voices"
RATE = 48_000
PIPER_BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
TEXT = "Hello, KidTok friends! Let's make a super fun video together!"

# Each group is a separate trained speaker, not the same speaker with a large
# pitch shift. The source model cards are intentionally picked from CC0/public
# domain datasets where possible. A light effect is added only after synthesis.
SOURCES = {
    "young": ("en_US-joe-medium", "en/en_US/joe/medium"),
    "girl": ("en_GB-cori-medium", "en/en_GB/cori/medium"),
    "woman": ("en_US-kristin-medium", "en/en_US/kristin/medium"),
    "grandpa": ("en_US-bryce-medium", "en/en_US/bryce/medium"),
}


def ensure_model(model_dir: Path, source: str) -> tuple[Path, Path]:
    model_name, source_path = SOURCES[source]
    voice_dir = model_dir / model_name
    voice_dir.mkdir(parents=True, exist_ok=True)
    model = voice_dir / f"{model_name}.onnx"
    config = voice_dir / f"{model_name}.onnx.json"
    for path in (model, config):
        if not path.exists():
            print(f"Downloading {path.name}…")
            urllib.request.urlretrieve(f"{PIPER_BASE_URL}/{source_path}/{path.name}", path)
    return model, config


def load_mono_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as source:
        if source.getsampwidth() != 2 or source.getnchannels() != 1:
            raise RuntimeError("Expected 16-bit mono WAV from Piper")
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(np.float32) / 32768
        return samples, source.getframerate()


def resample(audio: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate:
        return audio.copy()
    positions = np.linspace(0, len(audio) - 1, int(len(audio) * target_rate / source_rate), endpoint=True)
    return np.interp(positions, np.arange(len(audio)), audio).astype(np.float32)


def pitch_by_resampling(audio: np.ndarray, factor: float) -> np.ndarray:
    # Playing a shorter resampled waveform at the same rate changes pitch and
    # duration together. For 1-second picker samples that sounds more natural
    # than a crude time-stretch.
    positions = np.linspace(0, len(audio) - 1, max(1, int(len(audio) / factor)), endpoint=True)
    return np.interp(positions, np.arange(len(audio)), audio).astype(np.float32)


def lowpass(audio: np.ndarray, amount: float) -> np.ndarray:
    result = np.empty_like(audio)
    value = 0.0
    for index, sample in enumerate(audio):
        value += amount * (float(sample) - value)
        result[index] = value
    return result


def bright(audio: np.ndarray) -> np.ndarray:
    low = lowpass(audio, 0.10)
    return audio + 0.28 * (audio - low)


def echo(audio: np.ndarray, delay_ms: int, gain: float) -> np.ndarray:
    result = audio.copy()
    delay = max(1, int(RATE * delay_ms / 1000))
    if delay < len(result):
        result[delay:] += audio[:-delay] * gain
    return result


def robot(audio: np.ndarray) -> np.ndarray:
    time = np.arange(len(audio), dtype=np.float32) / RATE
    carrier = np.sin(2 * math.pi * 88 * time)
    # Keep a dry speech channel so every word remains clear for a child.
    return 0.68 * audio + 0.32 * audio * carrier


def normalize(audio: np.ndarray) -> np.ndarray:
    if not len(audio):
        return audio
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio = audio * (0.88 / peak)
    fade = min(int(RATE * 0.025), max(1, len(audio) // 8))
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    audio[:fade] *= ramp
    audio[-fade:] *= ramp[::-1]
    return np.clip(audio, -0.98, 0.98)


def write_wav(path: Path, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (normalize(audio) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(RATE)
        target.writeframes(pcm.tobytes())


def synthesize_source(model_dir: Path, source: str) -> np.ndarray:
    model, config = ensure_model(model_dir, source)
    temporary = OUT / f".{source}_base.wav"
    print(f"Synthesizing {source} voice…")
    voice = PiperVoice.load(model, config)
    with wave.open(str(temporary), "wb") as target:
        voice.synthesize_wav(TEXT, target)
    audio, source_rate = load_mono_wav(temporary)
    temporary.unlink(missing_ok=True)
    return resample(audio, source_rate, RATE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    args = parser.parse_args()

    sources = {source: synthesize_source(args.model_dir, source) for source in SOURCES}
    young = sources["young"]
    girl = sources["girl"]
    woman = sources["woman"]
    grandpa = sources["grandpa"]

    previews = {
        "natural_voice": bright(pitch_by_resampling(young, 1.05)),
        "bright_voice": bright(girl),
        "story_voice": lowpass(woman, 0.075),
        "robot_voice": echo(robot(young), 62, 0.10),
        "cartoon_voice": bright(pitch_by_resampling(girl, 1.11)),
        "giant_voice": lowpass(pitch_by_resampling(grandpa, 0.88), 0.045),
        "space_voice": echo(lowpass(grandpa, 0.16), 92, 0.18),
        "magic_voice": echo(bright(pitch_by_resampling(woman, 1.05)), 74, 0.12),
    }
    for name, audio in previews.items():
        path = OUT / f"{name}.wav"
        write_wav(path, audio)
        print(f"Wrote {path.name}")


if __name__ == "__main__":
    main()
