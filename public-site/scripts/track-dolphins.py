#!/usr/bin/env python3
"""Build the narrow-screen camera track from the original dolphin footage (FFmpeg, NumPy, Pillow)."""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

WIDTH, HEIGHT, STEP = 240, 135, .5
# This side profile provides a stable tracking anchor in the original footage.
PROFILE_TIME, PROFILE_BOX = 179.5, (.675, .42, .31)


def regions(mask):
    """Label foreground spans that touch across successive scanlines."""
    labels, spans, previous = [], [], []

    def root(i):
        while i != labels[i]:
            labels[i] = i = labels[labels[i]]
        return i

    for y, row in enumerate(mask):
        bounds = np.flatnonzero(np.diff(row, prepend=0, append=0)).reshape(-1, 2)
        current = []
        j = 0
        for x0, x1 in bounds:
            while j < len(previous) and previous[j][1] < x0:
                j += 1
            i = len(labels)
            labels.append(i)
            for px0, _, parent in previous[j:]:
                if px0 > x1:
                    break
                labels[root(parent)] = i
            current.append((x0, x1, i))
            spans.append((x0, y, x1, i))
        previous = current
    combined = {}
    for x0, y, x1, i in spans:
        label = root(i)
        if label not in combined:
            combined[label] = [x0, y, x1, y + 1, x1 - x0]
        else:
            box = combined[label]
            box[0], box[2] = min(x0, box[0]), max(x1, box[2])
            box[3], box[4] = y + 1, box[4] + x1 - x0
    return combined.values()


def candidates(frame):
    r, g, b = frame.astype(np.float32).transpose(2, 0, 1)
    skin = (r > .29 * b + 2) & (r > .39 * g + 2)
    skin[:int(.24 * HEIGHT)] = False
    # Join the dark fin tips to the lighter body without bridging open water.
    mask = Image.fromarray(np.uint8(skin) * 255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    found = []
    for x0, y0, x1, y1, area in regions(np.asarray(mask) > 0):
        w, h = x1 - x0, y1 - y0
        x, y = (x1 + x0) / 2 / WIDTH, (y1 + y0) / 2 / HEIGHT
        if area < 13 or w < 6 or h < 3 or w > .49 * WIDTH:
            continue
        density, aspect = area / (w * h), w / h
        if density < .18:
            continue
        side_profile = min(aspect / 2.1, 1, 7 / aspect)
        # Prefer intact, broadside dolphins below the reflective water surface.
        quality = min(w / 65, 1) * (.3 + .7 * side_profile) * (.55 + .45 * min(density / .54, 1))
        if x0 <= 2 or x1 >= WIDTH-2 or y1 >= HEIGHT-2:
            quality *= .53
        if y0 <= int(.24 * HEIGHT) + 1 or y < .31:
            quality *= .27 if y < .34 else .57
        quality *= .86 + .14 * (1 - abs(2*x - 1))
        found.append([x, y, w / WIDTH, quality])
    # A quiet neutral position can bridge frames with no clear side profile.
    return np.array(sorted(found, key=lambda item: item[3], reverse=True)[:12] or [[.54, .48, .23, 0]])


def choose_track(targets):
    back, prev = [None], targets[0][:, 3].copy()
    for a, b in zip(targets, targets[1:]):
        # Global path scoring lets the crop approach an incoming animal before it becomes prominent.
        gap = np.abs(a[:, None, :3] - b[None, :, :3])
        cost = gap @ np.array([2.9, 1.8, 1.05])
        options = prev[:, None] - cost
        best = options.argmax(axis=0)
        back.append(best)
        prev = options[best, np.arange(len(b))] + b[:, 3]
    route, j = [], int(prev.argmax())
    for i in range(len(targets)-1, -1, -1):
        route.append(targets[i][j, :3])
        if i:
            j = back[i][j]
    route = np.array(route[::-1])
    # Smooth transitions around shoal crossings, then widen the framing during a hand-off.
    taps = np.arange(-4, 5)
    weights = np.exp(-.5 * (taps / 1.45)**2)
    weights /= weights.sum()
    padded = np.pad(route, ((4, 4), (0, 0)), mode='edge')
    smooth = np.column_stack([np.convolve(col, weights, mode='valid') for col in padded.T])
    width = np.maximum(smooth[:, 2], route[:, 2] + 1.4 * abs(smooth[:, 0] - route[:, 0]))
    smooth[:, 2] = np.convolve(np.pad(width, 4, mode='edge'), weights, mode='valid')
    # Smooth the camera across the source edit from the last image to the first.
    join = (smooth[0] + smooth[-1]) / 2
    for tail in (smooth, smooth[::-1]):
        blend = np.exp(-.5 * (np.arange(len(route)) / 2.2)**2)
        tail += blend[:, None] * (join - tail[0])
    # Keep the camera on the selected animal through this broadside shot.
    anchor = round(PROFILE_TIME / STEP)
    if anchor < len(route):
        adjustment = np.exp(-.5 * ((np.arange(len(route)) - anchor) / 2.1)**2)
        smooth += adjustment[:, None] * (np.array(PROFILE_BOX) - smooth[anchor])
    return np.clip(smooth, 0, 1)


def generate(source, ffmpeg):
    command = [ffmpeg, '-v', 'error', '-i', str(source), '-an', '-vf', f'fps={1/STEP}:start_time=0,scale={WIDTH}:{HEIGHT}:flags=area',
               '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']
    targets = []
    with subprocess.Popen(command, stdout=subprocess.PIPE) as proc:
        while data := proc.stdout.read(WIDTH * HEIGHT * 3):
            f = np.frombuffer(data, np.uint8).reshape(HEIGHT, WIDTH, 3)
            boxes = candidates(f)
            if len(targets) == round(PROFILE_TIME / STEP):
                boxes = np.array([[*PROFILE_BOX, 1]])
            targets.append(boxes)
        if proc.wait() or not targets:
            raise RuntimeError('Could not read the dolphin footage')
    return choose_track(targets)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('source', type=Path)
    cli.add_argument('--ffmpeg', default='ffmpeg')
    cli.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'src/assets/dolphin/focus.json')
    args = cli.parse_args()
    points = generate(args.source, args.ffmpeg)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'step': STEP, 'points': points.round(3).tolist()}, separators=(',', ':')) + '\n')
