#!/usr/bin/env python3
"""
Build a unit sprite pack from key-pose PNGs.

Input defaults:
  output/imagegen/character01/{idle,attack,hit,death}.png

Output defaults:
  assets/sprites/units/hero_chibi_01/{idle,attack,hit,die}.png
  assets/sprites/units/hero_chibi_01/{idle,attack,hit,die}.meta.json
  assets/meta/unit-sprite-manifest.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class PoseSpec:
    fps: int
    loop: bool
    transforms: Tuple[Tuple[float, float, float, float, float], ...]
    # (dx, dy, rotation_deg, scale, alpha)


POSE_SPECS: Dict[str, PoseSpec] = {
    "idle": PoseSpec(
        fps=8,
        loop=True,
        transforms=(
            (-2.0, -10.0, -1.5, 1.00, 1.00),
            (0.0, -14.0, 0.0, 1.01, 1.00),
            (2.0, -10.0, 1.5, 1.00, 1.00),
            (0.0, -8.0, 0.0, 0.99, 1.00),
        ),
    ),
    "attack": PoseSpec(
        fps=12,
        loop=False,
        transforms=(
            (-18.0, -2.0, -7.0, 0.98, 1.00),
            (-6.0, -8.0, -2.0, 1.01, 1.00),
            (14.0, -10.0, 7.0, 1.05, 1.00),
            (2.0, -4.0, 1.0, 1.00, 1.00),
        ),
    ),
    "hit": PoseSpec(
        fps=10,
        loop=False,
        transforms=(
            (10.0, 0.0, 10.0, 1.00, 1.00),
            (18.0, 3.0, 15.0, 0.99, 1.00),
            (8.0, 2.0, 7.0, 1.00, 1.00),
            (0.0, 0.0, 0.0, 1.00, 1.00),
        ),
    ),
    "die": PoseSpec(
        fps=8,
        loop=False,
        transforms=(
            (0.0, 0.0, -10.0, 1.00, 1.00),
            (14.0, 24.0, 32.0, 0.99, 0.96),
            (30.0, 58.0, 86.0, 0.96, 0.84),
            (42.0, 96.0, 126.0, 0.94, 0.68),
        ),
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build sprite-strip + metadata from key poses.")
    parser.add_argument(
        "--input-dir",
        default="output/imagegen/character01",
        help="Directory containing key-pose PNGs.",
    )
    parser.add_argument(
        "--unit-id",
        default="hero_chibi_01",
        help="Unit id used for output folder and animation keys.",
    )
    parser.add_argument(
        "--output-root",
        default="assets/sprites/units",
        help="Root sprite output directory.",
    )
    parser.add_argument(
        "--manifest-path",
        default="assets/meta/unit-sprite-manifest.json",
        help="Manifest file to create/update.",
    )
    return parser.parse_args()


def clamp_alpha(image: Image.Image, alpha_scale: float) -> Image.Image:
    if alpha_scale >= 0.999:
        return image
    r, g, b, a = image.split()
    a = a.point(lambda v: int(max(0, min(255, round(v * alpha_scale)))))
    return Image.merge("RGBA", (r, g, b, a))


def build_frame(
    subject: Image.Image,
    canvas_size: Tuple[int, int],
    anchor: Tuple[float, float],
    transform: Tuple[float, float, float, float, float],
) -> Image.Image:
    dx, dy, rotation_deg, scale, alpha = transform
    canvas_w, canvas_h = canvas_size
    anchor_x, anchor_y = anchor

    target_w = max(1, int(round(subject.width * scale)))
    target_h = max(1, int(round(subject.height * scale)))
    transformed = subject.resize((target_w, target_h), Image.Resampling.LANCZOS)
    transformed = transformed.rotate(rotation_deg, resample=Image.Resampling.BICUBIC, expand=True)
    transformed = clamp_alpha(transformed, alpha)

    frame = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    paste_x = int(round(anchor_x - transformed.width / 2 + dx))
    paste_y = int(round(anchor_y - transformed.height + dy))
    frame.alpha_composite(transformed, (paste_x, paste_y))
    return frame


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def create_animation_strip(source_path: Path, pose_spec: PoseSpec, output_path: Path, meta_path: Path) -> None:
    source = Image.open(source_path).convert("RGBA")
    bbox = source.getbbox()
    if bbox is None:
        raise ValueError(f"source image has no visible pixels: {source_path}")

    subject = source.crop(bbox)
    canvas_w, canvas_h = source.width, source.height
    anchor = ((bbox[0] + bbox[2]) / 2.0, float(bbox[3]))

    frames = [
        build_frame(subject, (canvas_w, canvas_h), anchor, transform)
        for transform in pose_spec.transforms
    ]

    strip = Image.new("RGBA", (canvas_w * len(frames), canvas_h), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * canvas_w, 0))

    ensure_parent(output_path)
    strip.save(output_path)

    meta = {
        "version": "0.1.0",
        "frameWidth": canvas_w,
        "frameHeight": canvas_h,
        "frameCount": len(frames),
        "fps": pose_spec.fps,
        "loop": pose_spec.loop,
        "anchor": {"x": 0.5, "y": 1.0},
        "frames": [
            {
                "index": index,
                "x": index * canvas_w,
                "y": 0,
                "w": canvas_w,
                "h": canvas_h,
                "durationMs": int(round(1000 / pose_spec.fps)),
            }
            for index in range(len(frames))
        ],
    }
    ensure_parent(meta_path)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_manifest(manifest_path: Path, unit_id: str, output_unit_dir: Path) -> None:
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {"version": "0.1.0", "units": {}}

    if not isinstance(manifest, dict):
        raise ValueError("manifest root must be an object")
    if "units" not in manifest or not isinstance(manifest["units"], dict):
        manifest["units"] = {}

    animations = {}
    for animation in ("idle", "attack", "hit", "die"):
        rel_png = (output_unit_dir / f"{animation}.png").as_posix()
        rel_meta = (output_unit_dir / f"{animation}.meta.json").as_posix()
        animations[animation] = {
            "sheetPath": rel_png,
            "metaPath": rel_meta,
            "key": f"{unit_id}.{animation}",
        }

    manifest["units"][unit_id] = {
        "animations": animations,
        "defaultAnimation": "idle",
    }

    ensure_parent(manifest_path)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    input_dir = (ROOT / args.input_dir).resolve()
    unit_id = args.unit_id
    output_unit_dir = Path(args.output_root) / unit_id
    output_unit_dir_abs = (ROOT / output_unit_dir).resolve()
    manifest_path = (ROOT / args.manifest_path).resolve()

    source_map = {
        "idle": input_dir / "idle.png",
        "attack": input_dir / "attack.png",
        "hit": input_dir / "hit.png",
        "die": input_dir / "death.png",
    }

    missing = [str(path) for path in source_map.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"missing source files: {missing}")

    for animation, source_path in source_map.items():
        output_path = output_unit_dir_abs / f"{animation}.png"
        meta_path = output_unit_dir_abs / f"{animation}.meta.json"
        create_animation_strip(source_path, POSE_SPECS[animation], output_path, meta_path)

    update_manifest(manifest_path, unit_id, output_unit_dir)
    print(f"Built sprite pack for {unit_id}")
    print(f"Output directory: {output_unit_dir.as_posix()}")
    print(f"Manifest: {Path(args.manifest_path).as_posix()}")


if __name__ == "__main__":
    main()
