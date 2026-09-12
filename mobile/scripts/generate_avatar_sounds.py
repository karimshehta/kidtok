"""Generate short, original avatar UI sounds as mono PCM WAV assets.

The sounds are intentionally synthetic and under two seconds so they can play
instantly over a video without adding third-party licensing or network cost.
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


RATE = 22_050
OUT = Path(__file__).resolve().parents[1] / "assets" / "sounds" / "avatars"
random.seed(7)


def envelope(t: float, duration: float, attack: float = 0.035, release: float = 0.16) -> float:
    return min(1.0, t / attack) * min(1.0, max(0.0, duration - t) / release)


def tone(duration: float, freq, *, shape: str = "sine", volume: float = 0.45, vibrato: float = 0.0):
    samples = []
    phase = 0.0
    count = int(duration * RATE)
    for i in range(count):
        t = i / RATE
        hz = float(freq(t) if callable(freq) else freq)
        if vibrato:
            hz *= 1.0 + vibrato * math.sin(2 * math.pi * 6 * t)
        phase += 2 * math.pi * hz / RATE
        base = math.sin(phase)
        if shape == "square":
            base = 1.0 if base >= 0 else -1.0
        elif shape == "saw":
            base = 2.0 * ((phase / (2 * math.pi)) % 1.0) - 1.0
        samples.append(base * envelope(t, duration) * volume)
    return samples


def noise_growl(duration: float, base: float, volume: float = 0.42):
    samples = []
    phase = 0.0
    smooth_noise = 0.0
    count = int(duration * RATE)
    for i in range(count):
        t = i / RATE
        phase += 2 * math.pi * (base + 18 * math.sin(2 * math.pi * 1.7 * t)) / RATE
        smooth_noise = 0.93 * smooth_noise + 0.07 * random.uniform(-1, 1)
        value = 0.72 * math.sin(phase) + 0.28 * smooth_noise
        pulse = 0.72 + 0.28 * math.sin(2 * math.pi * 4.2 * t)
        samples.append(value * pulse * envelope(t, duration, 0.08, 0.25) * volume)
    return samples


def silence(duration: float):
    return [0.0] * int(duration * RATE)


def mix(*tracks):
    size = max(len(track) for track in tracks)
    result = [0.0] * size
    for track in tracks:
        for i, value in enumerate(track):
            result[i] += value
    peak = max(1.0, max(abs(v) for v in result) / 0.92)
    return [v / peak for v in result]


def sequence(*parts):
    result = []
    for part in parts:
        result.extend(part)
    return result


def save(name: str, samples):
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        frames = b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples)
        wav.writeframes(frames)


save("boy_chime", sequence(tone(0.18, 440), tone(0.26, 660)))
save("girl_chime", sequence(tone(0.15, 660), tone(0.15, 880), tone(0.30, 1046)))
save("robot_bleep", sequence(tone(0.13, 240, shape="square", volume=0.25), silence(0.05), tone(0.20, 390, shape="square", volume=0.25)))
save("cartoon_boing", tone(0.72, lambda t: 620 - 470 * (t / 0.72), shape="saw", volume=0.24, vibrato=0.025))
save("cartoon_giggle", sequence(tone(0.14, 720), silence(0.06), tone(0.14, 860), silence(0.05), tone(0.20, 980)))
save("lion_roar", noise_growl(1.15, 92, 0.50))
save("hero_whoosh", mix(tone(0.75, lambda t: 150 + 880 * (t / 0.75) ** 1.5, shape="saw", volume=0.18), noise_growl(0.75, 65, 0.20)))
save("princess_magic", sequence(tone(0.16, 523), tone(0.16, 659), tone(0.16, 784), tone(0.42, 1046, vibrato=0.01)))
save("space_signal", mix(tone(0.95, lambda t: 280 + 360 * (0.5 + 0.5 * math.sin(2 * math.pi * 1.2 * t)), volume=0.28), tone(0.95, 76, volume=0.10)))
save("king_fanfare", sequence(tone(0.20, 392, shape="saw", volume=0.20), tone(0.20, 523, shape="saw", volume=0.20), tone(0.52, 659, shape="saw", volume=0.20)))
save("elephant_trumpet", mix(tone(1.15, lambda t: 210 + 250 * min(1, t / 0.65), shape="saw", volume=0.28, vibrato=0.035), tone(1.15, 105, volume=0.12)))
save("dinosaur_roar", mix(noise_growl(1.35, 54, 0.58), tone(1.35, 43, shape="saw", volume=0.12)))

print(f"Generated 12 avatar sounds in {OUT}")

