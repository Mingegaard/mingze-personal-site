#!/usr/bin/env python3
"""Prepare the website's dolphin animation offline. Requires FFmpeg, NumPy and Pillow.

The supplied 1920×1080 footage is framed for an 184-column character field.
Kuimuztion/ASCII-Video inspired the use of luminance-based character rendering.
This encoder's colour separation, drawing and packing are independent implementations.

Example: python encode-dolphins.py footage.mp4 --font /System/Library/Fonts/Menlo.ttc --font-index 1
"""
import argparse
import gzip
import itertools
import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

COLS, ROWS = 184, 64
FIELD_ROWS, TOP = 56, 8
CELL_W, CELL_H = 8, 13
FPS = 15
ATLAS_COLS = 16
THEMES = {
    "light": (247, [(13, 49, 99), (21, 72, 132), (30, 99, 161), (49, 127, 187), (66, 147, 203)]),
    "dark": (16, [(47, 116, 178), (69, 151, 214), (108, 185, 237), (163, 215, 250), (212, 241, 255)]),
}
Y = np.arange(FIELD_ROWS)[:, None]
GRAIN = np.random.default_rng(7821).random((FIELD_ROWS, COLS))


def make_tiles(theme, font):
    paper, palette = THEMES[theme]
    dark = theme == "dark"
    stamps = {}

    def draw(char, ink, strength=1):
        if char not in stamps:
            mask = Image.new("L", (CELL_W, CELL_H))
            ImageDraw.Draw(mask).text(
                (CELL_W / 2, CELL_H / 2 - 1), char, fill=255, font=font, anchor="mm"
            )
            stamps[char] = np.asarray(mask, dtype=float)[:, :, None] / 255
        return paper + (np.asarray(ink, dtype=float) - paper) * strength * stamps[char]

    # Index 0 is blank. The next 14 tiles are water and the final 240 are dolphins.
    tiles = [np.full((CELL_H, CELL_W, 3), paper)]
    for level, char in enumerate(". .`':~-;rr+xx"):
        grey = 39 + level / 13 * 97 if dark else 211 - level / 13 * 83
        tiles.append(draw(char, [grey] * 3))
    ramp = "rv+xxsoOZS8%MB#@" if dark else "@#MB%8SZOsxvv++r"
    for level in range(15):
        ink = [np.interp(level / 14, np.linspace(0, 1, len(palette)), channel) for channel in zip(*palette)]
        for coverage in range(4):
            for direction in range(4):
                char = ramp[round(level * 15 / 14)]
                if direction and 2 <= level <= 13:
                    char = ("", "/", "\\", "|")[direction]
                tiles.append(draw(char, ink, .7 + .3 * coverage / 3))
    return np.asarray(np.clip(tiles, 0, 255), dtype=np.uint8)


def smoothstep(value, low, high):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def map_frame(rgb, previous):
    red, green, blue = rgb.astype(np.float32).transpose(2, 0, 1)
    light = .28 * red + .59 * green + .13 * blue
    # The relatively neutral skin of the dolphins separates from saturated blue water.
    key = smoothstep(red / (blue + 5), .205, .64)
    key *= .44 + .56 * smoothstep(red / (green + 7), .26, .70)
    source_y = ((Y + .5) / FIELD_ROWS * 870 + 118) / 1080
    below_surface = smoothstep(source_y, .205, .315)
    skin = key * below_surface
    lum = np.clip((light - 16) / 170, 0, 1)
    if previous is not None:
        lum = np.where(abs(lum - previous) < .075, .63 * lum + .37 * previous, lum)

    level = np.rint(np.clip(lum * 14 + (GRAIN - .5) * .72, 0, 14)).astype(np.uint16)
    coverage = np.rint(np.clip((skin - .16) / .84, 0, 1) * 3).astype(np.uint16)
    dy, dx = np.gradient(lum)
    diagonal = (abs(dx) > .12) & (abs(dy) > .07) & (GRAIN > .25)
    stroke = np.where(diagonal, np.where(dx * dy > 0, 1, 2), 0)
    stroke = np.where((abs(dx) > .19) & (abs(dy) < .025) & (GRAIN > .56), 3, stroke)
    dolphin = 15 + (level * 4 + coverage) * 4 + stroke

    # Use a stationary threshold pattern so the sea does not shimmer between frames.
    water = np.clip((light - 24) / 105, 0, 1)
    reflection = key * (1 - below_surface)
    tone = np.clip((water * .37 + reflection * .63) * smoothstep(Y, 0, 6), 0, 1)
    neutral = np.where(GRAIN < .14 + tone * .78, np.rint(tone * 13) + 1, 0)
    frame = np.zeros((ROWS, COLS), dtype=np.uint8)
    frame[TOP:] = np.where(skin > .21, dolphin, neutral)
    return frame, lum


def decode(ffmpeg, source, start, length):
    filters = f"fps={FPS},crop=1760:870:80:118,scale={COLS}:{FIELD_ROWS}:flags=area"
    cmd = [ffmpeg, "-loglevel", "error", "-ss", str(start), "-i", str(source), "-t", str(length),
           "-an", "-vf", filters, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
    size = FIELD_ROWS * COLS * 3
    with subprocess.Popen(cmd, stdout=subprocess.PIPE) as process:
        while data := process.stdout.read(size):
            if len(data) != size:
                raise ValueError("Incomplete frame from FFmpeg")
            yield np.frombuffer(data, np.uint8).reshape(FIELD_ROWS, COLS, 3)
        if process.wait():
            raise RuntimeError("FFmpeg could not decode the video")


def write_chunk(directory, group, chunks):
    frames = np.stack(group)
    packed = frames.copy()
    packed[1:] ^= frames[:-1]  # Independent first frame, bytewise XOR deltas thereafter.
    name = f"{len(chunks):02}.bin"
    (directory / name).write_bytes(gzip.compress(packed.tobytes(), compresslevel=7, mtime=0))
    chunks.append({"file": name, "frames": len(group)})
    group.clear()


def encode(source, ffmpeg, font, duration, start, output):
    directory = output / "dolphins"
    directory.mkdir()
    banks = {theme: make_tiles(theme, font) for theme in THEMES}
    for theme, tiles in banks.items():
        atlas = np.broadcast_to(tiles[0], (ATLAS_COLS**2, CELL_H, CELL_W, 3)).copy()
        atlas[:len(tiles)] = tiles
        grid = atlas.reshape(ATLAS_COLS, ATLAS_COLS, CELL_H, CELL_W, 3).transpose(0, 2, 1, 3, 4)
        Image.fromarray(grid.reshape(ATLAS_COLS * CELL_H, ATLAS_COLS * CELL_W, 3)).save(
            directory / f"{theme}.png", optimize=True
        )

    # Rotate the full film at the chosen opening shot, preserving its original speed.
    frames = decode(ffmpeg, source, start, duration - start)
    if start:
        frames = itertools.chain(frames, decode(ffmpeg, source, 0, start))
    chunks, group = [], []
    previous = None
    for rgb in frames:
        frame, lum = map_frame(rgb, previous)
        if previous is None:
            for theme, tiles in banks.items():
                pixels = tiles[frame].transpose(0, 2, 1, 3, 4).reshape(ROWS * CELL_H, COLS * CELL_W, 3)
                Image.fromarray(pixels).save(output / f"dolphin-{theme}.webp", quality=87, method=6)
        previous = lum
        group.append(frame)
        if len(group) == FPS * (8 if chunks else 4):
            write_chunk(directory, group, chunks)
    if group:
        write_chunk(directory, group, chunks)
    if not chunks:
        raise ValueError("No video frames were decoded")
    manifest = dict(cols=COLS, rows=ROWS, cellWidth=CELL_W, cellHeight=CELL_H,
                    atlasColumns=ATLAS_COLS, fps=FPS, chunks=chunks)
    (directory / "animation.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Encoded {sum(c['frames'] for c in chunks)} frames in {len(chunks)} chunks.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path)
    parser.add_argument("--font", required=True, type=Path, help="Monospace TTF or TTC")
    parser.add_argument("--font-index", type=int, default=0, help="Face index in a TTC font")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="FFmpeg executable")
    parser.add_argument("--duration", type=float, help="Source duration in seconds (default: probe with ffprobe)")
    parser.add_argument("--start", type=float, default=2.4, help="Opening position in seconds")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "src" / "assets")
    args = parser.parse_args()
    duration = args.duration
    if duration is None:
        probe = Path(args.ffmpeg).with_name("ffprobe")
        probe = str(probe.resolve()) if probe.is_file() else shutil.which("ffprobe")
        if not probe:
            parser.error("Install ffprobe or supply --duration in seconds.")
        duration = float(subprocess.check_output(
            [probe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(args.source)],
            text=True
        ))
    if not math.isfinite(duration) or duration <= 0 or not math.isfinite(args.start) or args.start < 0:
        parser.error("Duration must be positive and start must be nonnegative.")
    start = args.start if args.start < duration else 0
    font = ImageFont.truetype(str(args.font), 14, index=args.font_index)
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output) as temp:
        stage = Path(temp)
        encode(args.source, args.ffmpeg, font, duration, start, stage)
        files = sorted(stage.rglob("*"), key=lambda file: file.name == "animation.json")
        for file in files:
            if file.is_file():
                target = args.output / file.relative_to(stage)
                target.parent.mkdir(parents=True, exist_ok=True)
                file.replace(target)


if __name__ == "__main__":
    main()
