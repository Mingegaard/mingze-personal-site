#!/usr/bin/env python3
"""Prepare the 16:9 dolphin film and printable ASCII glyphs used by the website.

Requires FFmpeg and Pillow. Example for the original footage:
  python encode-dolphins.py footage.mp4 --font /System/Library/Fonts/Menlo.ttc --font-index 1

Run track-dolphins.py separately on the unrotated footage to rebuild focus.json.
"""
import argparse
import io
import json
import math
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FPS = 15
ASSETS = Path(__file__).resolve().parents[1] / "src" / "assets" / "dolphin"


def encode_film(ffmpeg, source, start, duration, output):
    # Put the broadside shot first, then wrap back to the beginning of the full film.
    filters = f"fps={FPS},scale=704:396:flags=area,hqdn3d=3:2:4:3,tpad=stop_mode=clone:stop_duration=0.2"
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    if start:
        command += ["-ss", str(start), "-i", str(source), "-t", str(start), "-i", str(source),
                    "-filter_complex", "[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];"
                    f"[a][b]concat=n=2:v=1:a=0,{filters}[v]", "-map", "[v]"]
    else:
        command += ["-i", str(source), "-map", "0:v:0", "-vf", filters]
    command += ["-map_metadata", "-1", "-an", "-frames:v", str(max(1, round(duration * FPS))),
                "-c:v", "libx264", "-preset", "slow", "-crf", "34", "-maxrate", "230k",
                "-bufsize", "460k", "-g", "45", "-keyint_min", "22", "-threads", "4",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)]
    subprocess.run(command, check=True)


def write_glyphs(font, output):
    sheet = Image.new("L", (256, 144))
    draw = ImageDraw.Draw(sheet)
    for i in range(95):
        x = (i % 16) * 16
        y = (i // 16) * 24
        draw.text((x + 8, y + 11), chr(32 + i), font=font, fill=255, anchor="mm")
    sheet.save(output, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path)
    parser.add_argument("--font", required=True, type=Path, help="Monospace TTF or TTC for the glyph atlas")
    parser.add_argument("--font-index", type=int, default=0, help="Face index for a TTC")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--duration", type=float, help="Source seconds, if ffprobe is unavailable")
    parser.add_argument("--start", type=float, default=179.5, help="Opening position in the source, in seconds")
    parser.add_argument("--output", type=Path, default=ASSETS)
    args = parser.parse_args()
    duration = args.duration
    if duration is None:
        duration = float(subprocess.check_output([
            args.ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(args.source)
        ], text=True))
    if not math.isfinite(duration) or duration <= 0 or not math.isfinite(args.start) or args.start < 0:
        parser.error("Provide a positive duration and a nonnegative opening position.")
    start = args.start if args.start < duration else 0
    font = ImageFont.truetype(str(args.font), 23, index=args.font_index)
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output) as temp:
        stage = Path(temp)
        video = stage / "ocean.mp4"
        encode_film(args.ffmpeg, args.source, start, duration, video)
        first_frame = subprocess.check_output([args.ffmpeg, "-loglevel", "error", "-i", str(video),
                                              "-frames:v", "1", "-c:v", "png", "-f", "image2pipe", "pipe:1"])
        Image.open(io.BytesIO(first_frame)).convert("RGB").save(stage / "still.webp", quality=96, method=6)
        write_glyphs(font, stage / "glyphs.png")
        metadata = {"sourceStart": start, "sourceDuration": round(duration, 3)}
        (stage / "media.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        for name in ("ocean.mp4", "still.webp", "glyphs.png", "media.json"):
            (stage / name).replace(args.output / name)


if __name__ == "__main__":
    main()
