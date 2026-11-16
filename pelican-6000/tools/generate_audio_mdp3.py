# 署名: PRO2H(hadcockulloa@gmail.com)
"""Build the deterministic, offline four-stem folk score and MDP3 telemetry.

Run with Python 3 + NumPy and Node.js, from any directory. No samples, network,
SciPy, or vendor assets are needed. Loops visit musical events/FFT batches,
never individual audio samples. MDP3 inverse STFT uses irfft(X)*512, the sine
window again, then divides overlap-add output by the accumulated window².
"""

from __future__ import annotations

import base64
import json
import lzma
import math
from pathlib import Path
import struct
import subprocess
import time

import numpy as np


SIGNATURE = "PRO2H(hadcockulloa@gmail.com)"
ROOT = Path(__file__).resolve().parents[1]
SR, DURATION = 24000, 174.64
N_SAMPLES = round(SR * DURATION)
WINDOW, HOP = 512, 256
NUM_FRAMES = math.ceil(N_SAMPLES / HOP)
TRACK_NAMES = ("vocal", "guitar", "iron", "room")
HEADER = struct.Struct("<4sIHHIBBHIf f")
FLOOR_DB, SPAN_DB = -96.0, 96.0
MIN_BYTES, TARGET_BYTES, MAX_BYTES = 450_000, 615_000, 750_000
RNG = np.random.default_rng(6000)
TAU = 2 * np.pi


def load_score():
    # Execute the real ES modules: makeCue(), rime reduction and timing weights
    # must run in Node; regex extraction of their JavaScript source loses data.
    script = """
import { MV_TIMELINE_CONFIG, SCENES_META } from './src/data/scenes-meta.js';
import { LYRICS_CUES } from './src/data/lyrics-data.js';
import { BEAT_TIMES, IRON_TIMES } from './src/core/timeline.js';
process.stdout.write(JSON.stringify({MV_TIMELINE_CONFIG, SCENES_META,
  LYRICS_CUES, BEAT_TIMES, IRON_TIMES}));
"""
    score = json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e", script], cwd=ROOT, text=True,
    ))
    config = score["MV_TIMELINE_CONFIG"]
    assert config["TOTAL_DURATION"] == DURATION
    assert len(score["LYRICS_CUES"]) == 36
    assert len(score["SCENES_META"]) == 20
    assert len(config["INTRO_IRON_TIMES"]) == 14
    assert (N_SAMPLES, NUM_FRAMES, HEADER.size) == (4191360, 16373, 32)
    for cue in score["LYRICS_CUES"]:
        assert cue["chars"] and cue["startT"] == cue["chars"][0]["t0"]
        assert cue["endT"] == cue["chars"][-1]["t1"]
        for char in cue["chars"]:
            assert {"ch", "t0", "t1", "midi", "vowel", "onset"} <= char.keys()
            assert cue["startT"] <= char["t0"] < char["t1"] <= cue["endT"]
    return score


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def local_time(length):
    return np.arange(length, dtype=np.float32) / SR


def add_event(track, t0, sound, gain=1.0):
    start = round(float(t0) * SR)
    stop = min(start + len(sound), N_SAMPLES)
    if stop > max(start, 0):
        offset = max(0, -start)
        track[max(start, 0):stop] += sound[offset:stop - start] * gain


def overlap_add(frames, hop):
    """Disjoint frame groups let NumPy overlap-add without a frame/sample loop."""
    size = frames.shape[1]
    output = np.zeros((len(frames) - 1) * hop + size, dtype=np.float32)
    for offset in range(size // hop):
        group = frames[offset::size // hop]
        start = offset * hop
        output[start:start + group.size].reshape(-1, size)[:] += group
    return output


# F1/F2/F3 in Hz, with separate vowel endpoints for diphthongs/nasal rimes.
FORMANTS = {
    "a": (790, 1220, 2630), "o": (470, 870, 2550),
    "e": (520, 1510, 2550), "i": (285, 2250, 3000),
    "u": (325, 790, 2260), "er": (485, 1330, 1770),
    "nasal": (310, 1120, 2350),
}
RIMES = {
    "a": ("a", "a"), "o": ("o", "o"), "e": ("e", "e"),
    "i": ("i", "i"), "u": ("u", "u"), "ai": ("a", "i"),
    "ei": ("e", "i"), "ao": ("a", "u"), "ou": ("o", "u"),
    "an": ("a", "nasal"), "en": ("e", "nasal"),
    "ang": ("a", "nasal"), "eng": ("e", "nasal"),
    "ong": ("o", "nasal"), "er": ("e", "er"),
}


def formant_filter(source, vowel):
    """1024-point WOLA with three cascaded resonances and moving endpoints."""
    size, hop = 1024, 512
    window = np.sin(np.pi * (np.arange(size) + 0.5) / size).astype(np.float32)
    padded = np.pad(source, (hop, size))
    frames = np.lib.stride_tricks.sliding_window_view(padded, size)[::hop]
    spectrum = np.fft.rfft(frames * window, axis=1)
    frequencies = np.fft.rfftfreq(size, 1 / SR)[None, :]
    progress = np.clip(np.arange(len(frames)) * hop / max(len(source), 1), 0, 1)
    morph = smoothstep((progress - 0.40) / 0.46)[:, None]
    first, last = (FORMANTS[name] for name in RIMES[vowel])
    # Spectral multiplication is the frequency-domain equivalent of cascading
    # three resonant filters; pre-emphasis makes F2/F3 audible above the glottis.
    response = np.broadcast_to(
        (np.maximum(frequencies, 90) / 300) ** 1.2, spectrum.shape,
    ).copy()
    for a, b, width, gain in zip(first, last, (90, 140, 200), (7, 11, 10)):
        center = a + (b - a) * morph
        response *= 1 + gain / (1 + ((frequencies - center) / width) ** 2)
    response *= 1 / (1 + (frequencies / 6500) ** 4)
    spectrum *= response
    filtered = np.fft.irfft(spectrum, n=size, axis=1).astype(np.float32)
    result = overlap_add(filtered * window, hop)[hop:hop + len(source)]
    result *= 0.21 / max(float(np.sqrt(np.mean(result * result))), 1e-7)
    return result


def consonant(onset, length, midi):
    t = local_time(length)
    noise = RNG.standard_normal(length).astype(np.float32)
    air = np.diff(noise, prepend=noise[0]) * 0.55
    if onset in ("zh", "ch", "sh", "z", "c", "s", "j", "q", "x", "f", "h"):
        center = 2900 if onset in ("zh", "ch", "sh") else 4800
        if onset in ("j", "q", "x"):
            center = 3600
        # Short resonant noise bursts distinguish retroflex/alveolar/palatal air.
        freqs = np.fft.rfftfreq(length, 1 / SR)
        colored = np.fft.irfft(np.fft.rfft(air) *
                              np.exp(-0.5 * ((freqs - center) / 1400) ** 2), n=length)
        return (0.065 * colored * np.sin(np.pi * np.minimum(t / 0.075, 1)) ** 2 *
                np.exp(-t / 0.055)).astype(np.float32)
    if onset in ("t", "d", "p", "b", "k", "g"):
        release = np.exp(-np.maximum(t - 0.009, 0) / 0.012) * smoothstep(t / 0.009)
        aspiration = 0.7 if onset in ("t", "p", "k") else 0.25
        return (0.11 * air * release + aspiration * 0.025 * air *
                np.exp(-t / 0.045)).astype(np.float32)
    if onset in ("m", "n", "l", "r", "y", "w"):
        frequency = 440 * 2 ** ((midi - 69) / 12)
        resonant = np.sin(TAU * frequency * t) + 0.25 * np.sin(TAU * frequency * 2 * t)
        return (0.055 * resonant * np.sin(np.pi * np.minimum(t / 0.09, 1)) ** 2 *
                np.exp(-t / 0.075)).astype(np.float32)
    return np.zeros(length, dtype=np.float32)


def synth_vocal(score):
    vocal = np.zeros(N_SAMPLES, dtype=np.float32)
    previous_midi, previous_end = 62, -1
    for cue in score["LYRICS_CUES"]:
        chorus = cue["section"].startswith("chorus")
        for index, char in enumerate(cue["chars"]):
            length = round(char["t1"] * SR) - round(char["t0"] * SR)
            t = local_time(length)
            duration = char["t1"] - char["t0"]
            target = char["midi"]
            origin = previous_midi if char["t0"] - previous_end < 0.10 else target - 0.45
            pitch = origin + (target - origin) * smoothstep(t / 0.020)
            bloom = smoothstep((t - 0.120) / 0.180)
            pitch += 0.17 * bloom * np.sin(TAU * 5.3 * t + index * 0.27)
            pitch -= 0.11 * smoothstep((t - duration * 0.83) / max(duration * 0.17, 0.01))
            frequency = 440 * np.exp2((pitch - 69) / 12)
            phase = np.cumsum(frequency, dtype=np.float64) * (TAU / SR)
            harmonics = np.arange(1, min(48, int((SR / 2 - 80) / frequency.max())) + 1)
            # h^-2 is exactly -12 dB/oct in harmonic amplitude. Every harmonic
            # stays below Nyquist, including vibrato and the portamento extrema.
            excitation = np.sum(np.sin(phase[:, None] * harmonics) /
                                harmonics[None, :] ** 2, axis=1).astype(np.float32)
            excitation += 0.003 * RNG.standard_normal(length).astype(np.float32)
            sung = formant_filter(excitation, char["vowel"])
            attack = 0.033 if char["onset"] else 0.018
            envelope = smoothstep(t / attack) * smoothstep((duration - t) / 0.045)
            envelope *= 0.91 + 0.09 * np.sin(np.pi * t / duration)
            phrase = 0.87 + 0.13 * math.sin(np.pi * (index + 1) / (len(cue["chars"]) + 1))
            sung *= envelope * phrase * (1.12 if chorus else 0.96)
            n = min(length, round(SR * 0.14))
            sung[:n] += consonant(char["onset"], n, target)
            add_event(vocal, char["t0"], sung)
            previous_midi, previous_end = target, char["t1"]
    return vocal


def modal_sound(frequency, ratios, decay, duration, brightness=1.0):
    t = local_time(round(duration * SR))
    ratios = np.asarray(ratios, dtype=np.float32)
    audible = frequency * ratios < SR / 2 - 80
    ratios = ratios[audible]
    weights = brightness / np.arange(1, len(ratios) + 1, dtype=np.float32) ** 1.12
    modes = np.sin(TAU * t[:, None] * frequency * ratios)
    modes *= np.exp(-t[:, None] * (1 + np.arange(len(ratios)) * 0.23) / decay)
    signal = np.sum(modes * weights, axis=1).astype(np.float32)
    signal *= smoothstep(t / 0.0015) * smoothstep((duration - t) / 0.035)
    return signal


def synth_guitar(score):
    guitar = np.zeros(N_SAMPLES, dtype=np.float32)
    chords = {
        "G": (43, 47, 50, 55, 59, 67), "D": (38, 45, 50, 57, 62, 66),
        "Em": (40, 47, 52, 55, 59, 64), "C": (36, 43, 48, 55, 60, 64),
    }
    cache = {}

    def string(midi):
        if midi not in cache:
            frequency = 440 * 2 ** ((midi - 69) / 12)
            t = local_time(round(2.5 * SR))
            h = np.arange(1, 21, dtype=np.float32)
            modes = frequency * h * np.sqrt(1 + 0.000035 * h * h)
            weights = np.sin(h * np.pi * 0.21) / h ** 1.35
            wave = np.sin(TAU * t[:, None] * modes) * np.exp(
                -t[:, None] * h ** 0.55 / 0.93)
            wave = np.sum(wave * weights, axis=1).astype(np.float32)
            # Mahogany soundboard resonances accompany all six tuned strings.
            wave += 0.11 * np.sin(TAU * 105 * t) * np.exp(-t / 0.28)
            wave += 0.065 * np.sin(TAU * 225 * t) * np.exp(-t / 0.19)
            wave *= smoothstep(t / 0.002) * smoothstep((2.5 - t) / 0.08)
            cache[midi] = wave
        return cache[midi]

    start, cadence = score["MV_TIMELINE_CONFIG"]["ACT1_END"], 161.65
    beats = [start] + [t for t in score["BEAT_TIMES"] if start < t < cadence]
    chorus_ranges = [(c["startT"], c["endT"]) for c in score["LYRICS_CUES"]
                     if c["section"].startswith("chorus")]
    for index, beat in enumerate(beats):
        period = (beats[index + 1] - beat) if index + 1 < len(beats) else 0.713
        chorus = any(a <= beat < b for a, b in chorus_ranges)
        progression = ("G", "Em", "C", "D") if chorus else ("G", "D", "Em", "C")
        chord = chords[progression[(index // 4) % 4]]
        if chorus:
            for s, midi in enumerate(chord):
                add_event(guitar, beat + s * 0.012, string(midi), 0.061)
                add_event(guitar, beat + period * 0.5 + (5 - s) * 0.009,
                          string(midi), 0.027)
        else:
            order = (0, 3, 2, 4, 1, 5, 2, 4)
            for offset in (0, 0.5):
                s = order[(index * 2 + int(offset * 2)) % len(order)]
                add_event(guitar, beat + period * offset, string(chord[s]), 0.105)
    for beat, name, gain in ((161.65, "C", 0.045), (164.0, "D", 0.034),
                             (166.5, "G", 0.028), (169.0, "G", 0.021)):
        for s, midi in enumerate(chords[name]):
            add_event(guitar, beat + s * 0.025, string(midi), gain)
    t = local_time(N_SAMPLES)
    guitar *= 1 - smoothstep((t - cadence) / (172.0 - cadence))
    return guitar


def synth_iron(score):
    iron = np.zeros(N_SAMPLES, dtype=np.float32)
    light = modal_sound(635, (1, 2.75, 5.4, 8.9), 0.19, 0.8)
    heavy = modal_sound(154, (1, 2.09, 3.42, 4.95, 6.7), 0.62, 2.4)
    for sound, strength in ((light, 0.025), (heavy, 0.018)):
        n = min(len(sound), round(0.016 * SR))
        sound[:n] += strength * RNG.standard_normal(n) * np.exp(-local_time(n) / 0.004)
    intro = score["MV_TIMELINE_CONFIG"]["INTRO_IRON_TIMES"]
    for index, beat in enumerate(intro):
        add_event(iron, beat, light if index % 2 == 0 else heavy,
                  0.23 if index % 2 == 0 else 0.27)
    choruses = [(c["startT"], c["endT"]) for c in score["LYRICS_CUES"]
                if c["section"].startswith("chorus")]
    for index, beat in enumerate(score["IRON_TIMES"]):
        if beat <= intro[-1] or beat >= 168:
            continue
        chorus = any(a <= beat < b for a, b in choruses)
        add_event(iron, beat, light if index % 3 else heavy,
                  (0.071 if chorus else 0.018) * (0.8 if index % 2 else 1))
    # Bicycle bells follow the actual syllable onsets, not guessed cue centers.
    for cue in score["LYRICS_CUES"]:
        if cue["id"] in (5, 10, 26, 33):
            chars = cue["chars"] if cue["id"] in (10, 26) else cue["chars"][:3]
            for index, char in enumerate(chars):
                bell = modal_sound(1568 * (1 if index % 3 < 2 else 0.75),
                                   (1, 2.001, 2.76, 4.07), 0.32, 1.4)
                add_event(iron, char["t0"], bell, 0.12)
    for index, scene in enumerate(score["SCENES_META"]):
        chime = modal_sound(784 * 2 ** ((index % 3) * 2 / 12),
                            (1, 2, 3.01), 0.37, 1.6)
        add_event(iron, scene["startT"], chime, 0.026)
    scene = next(s for s in score["SCENES_META"] if s["id"] == 16)
    for index, beat in enumerate(np.arange(scene["startT"], scene["endT"] - 0.8, 0.72)):
        notes = (79, 83, 86, 91) if index % 3 else (76, 79, 83, 79, 84, 88)
        for step, midi in enumerate(notes):
            duration = 0.105
            t = local_time(round(duration * SR))
            f = 440 * 2 ** ((midi - 69) / 12)
            h = np.arange(1, min(9, int((SR / 2 - 80) / f)) + 1, 2)
            chip = np.sum(np.sin(TAU * f * t[:, None] * h) / h, axis=1)
            chip *= smoothstep(t / 0.003) * smoothstep((duration - t) / 0.015)
            add_event(iron, beat + step * 0.105, chip.astype(np.float32), 0.055)
    return iron


def synth_room(vocal, guitar, iron, score):
    t = local_time(N_SAMPLES)
    source = 0.27 * vocal + 0.26 * guitar + 0.23 * iron
    # A short FIR damps highs before a sparse convolver. Four coprime delay
    # lines, four attenuated recirculations and polarity diffusion form a
    # finite FDN impulse response, with no slow sample-wise feedback loop.
    source = np.convolve(source, np.ones(9, dtype=np.float32) / 9, mode="same")
    room = np.zeros(N_SAMPLES, dtype=np.float32)
    for line, delay in enumerate((0.037, 0.053, 0.079, 0.113)):
        for bounce in range(1, 5):
            offset = round((delay * bounce + 0.021 * bounce * bounce) * SR)
            gain = 0.32 * 0.57 ** (bounce - 1) * (-1 if (line + bounce) % 3 == 0 else 1)
            room[offset:] += source[:-offset] * gain
    air = RNG.standard_normal(N_SAMPLES).astype(np.float32)
    air = np.convolve(air, np.ones(17, dtype=np.float32) / 17, mode="same")
    room += 0.00045 * air + 0.00035 * np.sin(TAU * 71.3 * t)
    forge = smoothstep(t / 0.12) * (1 - smoothstep((t - 3.55) / 0.8))
    ember = 0.012 * np.sin(TAU * 52 * t) + 0.006 * np.sin(TAU * 93 * t) + 0.009 * air
    ember += 0.0025 * np.sin(TAU * 331 * t) * np.sin(TAU * 0.71 * t)
    ember += 0.0018 * np.sin(TAU * 877 * t) * np.sin(TAU * 0.33 * t)
    room += forge * ember
    scene = next(s for s in score["SCENES_META"] if s["id"] == 18)
    for start, end, gain, tape in ((scene["startT"], scene["endT"], 0.013, True),
                                  (168.0, DURATION, 0.009, False)):
        a, b = round(start * SR), round(end * SR)
        local = local_time(b - a)
        envelope = smoothstep(local / 0.8) * smoothstep((end - start - local) / 1.6)
        pad = np.zeros(b - a, dtype=np.float32)
        for midi in (43, 50, 59, 62):
            f = 440 * 2 ** ((midi - 69) / 12)
            # Lower octave, slow tape wow/flutter, and a small varispeed fall.
            rate = 1 + 0.004 * np.sin(TAU * 0.27 * local)
            if tape:
                rate += 0.0015 * np.sin(TAU * 1.7 * local)
                rate -= 0.014 * smoothstep(local / (end - start))
            phase = np.cumsum(rate, dtype=np.float64) * TAU * f / SR
            for h in (1, 2, 3):
                pad += (np.sin(h * phase) / h ** 2).astype(np.float32)
        room[a:b] += pad * envelope * gain
    room *= smoothstep(t / 0.04) * smoothstep((DURATION - t) / 1.6)
    return room


def rms(signal):
    return float(np.sqrt(np.mean(np.square(signal, dtype=np.float64))))


def synthesis_checks(tracks, score):
    for name, track in zip(TRACK_NAMES, tracks):
        assert track.shape == (N_SAMPLES,) and np.isfinite(track).all()
        assert rms(track) > 1e-4, f"Silent {name}"
    for cue in score["LYRICS_CUES"]:
        for char in cue["chars"]:
            assert rms(tracks[0][round(char["t0"] * SR):round(char["t1"] * SR)]) > 0.01
    start = round(score["MV_TIMELINE_CONFIG"]["ACT1_END"] * SR)
    assert not np.any(tracks[1][:start]), "Guitar entered before ACT1_END"
    assert rms(tracks[1][start:start + round(0.10 * SR)]) > 1e-3
    assert not np.any(tracks[1][round(172 * SR):]), "Guitar cadence overruns 172s"
    for beat in score["MV_TIMELINE_CONFIG"]["INTRO_IRON_TIMES"]:
        a = round(beat * SR)
        assert rms(tracks[2][a:a + round(0.08 * SR)]) > 0.01
    room_blocks = tracks[3][:N_SAMPLES // SR * SR].reshape(-1, SR)
    assert np.min(np.sqrt(np.mean(room_blocks ** 2, axis=1))) > 1e-5
    print("Synthesis: all 36 cues/syllables, guitar at 3.55s, 14 iron strikes, room throughout: PASS")
    print("Track RMS:", {name: round(rms(track), 5) for name, track in zip(TRACK_NAMES, tracks)})


def analyze(track, max_peaks):
    window = np.sin(np.pi * (np.arange(WINDOW) + 0.5) / WINDOW).astype(np.float32)
    length = (NUM_FRAMES - 1) * HOP + WINDOW
    padded = np.pad(track, (0, length - N_SAMPLES))
    frames = np.lib.stride_tricks.sliding_window_view(padded, WINDOW)[::HOP]
    spectrum = (np.fft.rfft(frames * window, axis=1) / WINDOW).astype(np.complex64)
    mags = np.abs(spectrum[:, 1:256])
    indices = np.argpartition(mags, -max_peaks, axis=1)[:, -max_peaks:]
    values = np.take_along_axis(mags, indices, axis=1)
    order = np.argsort(-values, axis=1)
    indices = np.take_along_axis(indices, order, axis=1) + 1
    selected = np.take_along_axis(spectrum, indices, axis=1)
    return indices.astype(np.uint8), np.abs(selected), np.angle(selected)


def encode_track(analysis, k):
    bins, mags, angles = (a[:, :k] for a in analysis)
    peak = mags[:, 0]
    active = (peak > 1e-6)[:, None] & (mags >= peak[:, None] * 10 ** (-55 / 20))
    counts = active.sum(axis=1).astype(np.uint8)
    peak_db = np.clip(20 * np.log10(np.maximum(peak, 1e-30)), FLOOR_DB, 0)
    scales = np.clip(np.rint((peak_db - FLOOR_DB) / SPAN_DB * 255), 1, 255).astype(np.uint8)
    scales[counts == 0] = 0
    peak_quant = 10 ** ((FLOOR_DB + scales.astype(np.float64) / 255 * SPAN_DB) / 20)
    mag_q = np.clip(np.rint(mags / peak_quant[:, None] * 255), 1, 255).astype(np.uint8)
    phase_q = (np.rint(angles / TAU * 256).astype(np.int32) % 256).astype(np.uint8)
    order = np.argsort(bins, axis=1)
    keep = np.take_along_axis(active, order, axis=1)
    arrays = [np.take_along_axis(a, order, axis=1)[keep] for a in (bins, mag_q, phase_q)]
    return counts.tobytes() + scales.tobytes() + b"".join(a.tobytes() for a in arrays)


def encode_mdp3(analyses):
    header = HEADER.pack(b"MDP3", SR, WINDOW, HOP, NUM_FRAMES, 4, 1, 0,
                         round(DURATION * 1000), FLOOR_DB, SPAN_DB)
    limits = np.array([18, 18, 14, 14])
    peaks = np.array([8, 8, 6, 5])
    attempted = set()
    for _ in range(8):
        attempted.add(tuple(peaks))
        raw = header + b"".join(encode_track(a, int(k)) for a, k in zip(analyses, peaks))
        packed = lzma.compress(raw, format=lzma.FORMAT_ALONE, preset=6)
        print(f"MDP3 K={peaks.tolist()}: raw={len(raw):,}, LZMA={len(packed):,} bytes")
        if MIN_BYTES <= len(packed) <= MAX_BYTES:
            return raw, packed, peaks
        factor = TARGET_BYTES / len(packed)
        candidate = np.clip(np.rint(peaks * factor), 2, limits).astype(int)
        if tuple(candidate) in attempted:
            candidate = peaks + (1 if len(packed) < MIN_BYTES else -1)
            candidate = np.clip(candidate, 2, limits)
        peaks = candidate
    raise AssertionError("Could not meet the 450–750 KB MDP3 size budget")


def decode_and_check(raw, packed, tracks):
    payload = lzma.decompress(packed, format=lzma.FORMAT_ALONE)
    assert payload == raw, "LZMA round trip failed"
    assert HEADER.unpack_from(payload) == (b"MDP3", SR, WINDOW, HOP, NUM_FRAMES,
                                            4, 1, 0, 174640, -96.0, 96.0)
    offset = HEADER.size
    window = np.sin(np.pi * (np.arange(WINDOW) + 0.5) / WINDOW).astype(np.float32)
    weights = overlap_add(np.broadcast_to(window ** 2, (NUM_FRAMES, WINDOW)), HOP)
    decoded, statistics = [], {}
    for name, source in zip(TRACK_NAMES, tracks):
        counts = np.frombuffer(payload, np.uint8, NUM_FRAMES, offset)
        offset += NUM_FRAMES
        scales = np.frombuffer(payload, np.uint8, NUM_FRAMES, offset)
        offset += NUM_FRAMES
        total = int(counts.sum())
        arrays = [np.frombuffer(payload, np.uint8, total, offset + i * total) for i in range(3)]
        offset += 3 * total
        bins, mag_q, phase_q = arrays
        assert np.all((bins >= 1) & (bins <= 255))
        assert np.all((counts == 0) == (scales == 0))
        rows = np.repeat(np.arange(NUM_FRAMES), counts)
        boundaries = np.cumsum(counts, dtype=np.int64)
        adjacent = np.ones(max(total - 1, 0), dtype=bool)
        adjacent[boundaries[(boundaries > 0) & (boundaries < total)] - 1] = False
        assert np.all(np.diff(bins.astype(np.int16))[adjacent] > 0), "Unsorted bins"
        peak_quant = 10 ** ((FLOOR_DB + scales.astype(np.float64) / 255 * SPAN_DB) / 20)
        spectrum = np.zeros((NUM_FRAMES, 257), dtype=np.complex64)
        spectrum[rows, bins] = peak_quant[rows] * (mag_q / 255.0) * np.exp(1j * TAU * phase_q / 256)
        frames = (np.fft.irfft(spectrum, n=WINDOW, axis=1) * WINDOW * window).astype(np.float32)
        restored = overlap_add(frames, HOP)[:N_SAMPLES]
        restored /= np.maximum(weights[:N_SAMPLES], 1e-12)
        assert np.isfinite(restored).all() and rms(restored) > 1e-4
        # Exclude the uncentered first half-window from fidelity metrics: at the
        # left edge its tiny window needs a decoder's 10ms playback fade-in.
        a, b = source[WINDOW:], restored[WINDOW:]
        source_power = float(np.sum(a * a, dtype=np.float64))
        restored_power = float(np.sum(b * b, dtype=np.float64))
        correlation = float(np.sum(a * b, dtype=np.float64)) / math.sqrt(source_power * restored_power)
        snr = 20 * math.log10(rms(a) / max(rms(a - b), 1e-12))
        assert correlation > 0.65 and snr > 0, f"Poor reconstruction of {name}"
        assert float(np.max(np.abs(restored))) < 1.5, f"Unstable OLA in {name}"
        statistics[name] = {"rms": round(rms(restored), 6), "correlation": round(correlation, 4),
                            "snrDb": round(snr, 2), "bins": total}
        decoded.append(restored)
    assert offset == len(payload), "Unexpected trailing/truncated MDP3 data"
    print("MDP3 inverse-STFT round trip: PASS", json.dumps(statistics))
    return decoded, statistics


def emit_telemetry(tracks):
    fps, quantization = 30, 1000
    count = math.ceil(DURATION * fps) + 1
    times = np.minimum(np.arange(count) / fps, DURATION)
    centers = np.rint(times * SR).astype(np.int64)
    left, right = np.maximum(centers - 600, 0), np.minimum(centers + 600, N_SAMPLES)
    envelopes, references = {}, {}
    for name, track in zip(TRACK_NAMES, tracks):
        energy = np.concatenate(([0.0], np.cumsum(track.astype(np.float64) ** 2)))
        envelope = np.sqrt((energy[right] - energy[left]) / np.maximum(right - left, 1))
        reference = max(float(np.quantile(envelope, 0.97)), 1e-6)
        references[name] = round(reference, 7)
        envelopes[name] = np.rint(np.clip(envelope / reference, 0, 1) * quantization).astype(int).tolist()
        assert len(envelopes[name]) == count and max(envelopes[name]) == quantization
    lines = [f"// 署名: {SIGNATURE}",
             "// 50ms centered RMS of the delivered MDP3 reconstruction; final frame is at duration.",
             "const tracks = {"]
    for name in TRACK_NAMES:
        lines.append(f"  {name}: new Uint16Array({json.dumps(envelopes[name], separators=(',', ':'))}),")
    lines += ["};", "", "export const AUDIO_TELEMETRY = Object.freeze({",
              f"  fps: {fps}, sampleRate: {fps}, hopSize: 1, duration: {DURATION},",
              f"  frameCount: {count}, quantization: {quantization},",
              f"  referenceRms: Object.freeze({json.dumps(references, separators=(',', ':'))}),",
              "  tracks: Object.freeze(tracks), ...tracks, sample: sampleAudioTelemetry,", "});", "",
              "// Returns normalized [0..1] values, with interpolation and clamped endpoints.",
              "export function sampleAudioTelemetry(t) {",
              "  const { fps, duration, frameCount, quantization } = AUDIO_TELEMETRY;",
              "  const time = Math.max(0, Math.min(duration, Number.isFinite(t) ? t : 0));",
              "  const i = Math.min(Math.floor(time * fps), frameCount - 2);",
              "  const nextT = Math.min((i + 1) / fps, duration);",
              "  const mix = Math.max(0, Math.min(1, (time - i / fps) / (nextT - i / fps)));",
              "  const sample = {};",
              "  for (const name of ['vocal', 'guitar', 'iron', 'room']) {",
              "    const values = tracks[name];",
              "    sample[name] = (values[i] + (values[i + 1] - values[i]) * mix) / quantization;",
              "  }", "  return sample;", "}", ""]
    (ROOT / "src/data/audio-telemetry.js").write_text("\n".join(lines), encoding="utf-8")
    print(f"Telemetry: {count} frames at {fps} fps, 0..{DURATION}s, quantized 0..1000")


def main():
    started = time.perf_counter()
    score = load_score()
    vocal = synth_vocal(score)
    guitar = synth_guitar(score)
    iron = synth_iron(score)
    room = synth_room(vocal, guitar, iron, score)
    tracks = [vocal, guitar, iron, room]
    # Shared gain keeps the four separately decoded stems mixable without clip.
    mix_peak = float(np.max(np.abs(sum(tracks))))
    gain = min(1.0, 0.90 / max(mix_peak, 1e-9))
    for track in tracks:
        track *= gain
    synthesis_checks(tracks, score)
    print(f"Vectorized synthesis: {time.perf_counter() - started:.2f}s")
    analyses = [analyze(track, k) for track, k in zip(tracks, (18, 18, 14, 14))]
    raw, packed, peaks = encode_mdp3(analyses)
    decoded, statistics = decode_and_check(raw, packed, tracks)
    metadata = {
        "format": "MDP3", "compression": "lzma-alone", "sampleRate": SR,
        "windowSize": WINDOW, "hopSize": HOP, "numFrames": NUM_FRAMES,
        "trackCount": 4, "channels": 1, "tracks": list(TRACK_NAMES),
        "duration": DURATION, "durationMs": 174640, "sampleCount": N_SAMPLES,
        "floorDb": FLOOR_DB, "spanDb": SPAN_DB, "window": "sine",
        "peakCounts": dict(zip(TRACK_NAMES, map(int, peaks))),
        "compressedBytes": len(packed), "uncompressedBytes": len(raw),
        "reconstruction": statistics, "signature": SIGNATURE,
    }
    b64 = base64.b64encode(packed).decode("ascii")
    content = (f"// 署名: {SIGNATURE}\n"
               "// Generated by tools/generate_audio_mdp3.py; MDP3 track-major sparse STFT, LZMA-alone.\n"
               f"export const AUDIO_MDP3_META = Object.freeze({json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))});\n"
               f"export const AUDIO_MDP3_B64 = '{b64}';\n")
    (ROOT / "src/data/audio-mdp3.js").write_text(content, encoding="utf-8")
    emit_telemetry(decoded)
    print(f"Compressed: {len(packed):,} bytes; Base64: {len(b64):,} characters; "
          f"audio JS: {len(content.encode('utf-8')):,} bytes")
    print(f"All self-checks passed; total runtime {time.perf_counter() - started:.2f}s")


if __name__ == "__main__":
    main()
