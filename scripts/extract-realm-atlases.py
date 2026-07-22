#!/usr/bin/env python3
"""Extract checked-in Realm art atlases into versioned production assets."""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image


ALPHA_THRESHOLD = 16


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="mode", required=True)

    grid = subparsers.add_parser("grid", help="Extract a regular row/column atlas")
    add_shared_args(grid)
    grid.add_argument("--rows", required=True, type=int)
    grid.add_argument("--cols", required=True, type=int)
    grid.add_argument(
        "--largest-component",
        action="store_true",
        help="Ignore small artwork leaking across cell boundaries and crop the largest subject",
    )
    labels = grid.add_mutually_exclusive_group(required=True)
    labels.add_argument(
        "--column-labels",
        help="Comma-separated labels, one for each column",
    )
    labels.add_argument(
        "--cell-labels",
        help="Comma-separated labels in row-major order, one for each cell",
    )

    components = subparsers.add_parser(
        "components", help="Extract connected non-transparent components"
    )
    add_shared_args(components)
    components.add_argument("--min-pixels", type=int, default=300)

    return parser.parse_args()


def add_shared_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--padding", type=int, default=8)
    parser.add_argument(
        "--output-format",
        choices=("png", "webp"),
        default="png",
        help="Runtime image format (default: png)",
    )


def alpha_bbox(image: Image.Image, threshold: int = ALPHA_THRESHOLD):
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > threshold else 0)
    return mask.getbbox()


def padded_bbox(bbox, width: int, height: int, padding: int):
    left, top, right, bottom = bbox
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(width, right + padding),
        min(height, bottom + padding),
    )


def prepare_output_dir(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    existing = (
        list(output_dir.glob("*.png"))
        + list(output_dir.glob("*.webp"))
        + list(output_dir.glob("manifest.json"))
    )
    if existing:
        paths = ", ".join(str(path) for path in existing[:3])
        raise FileExistsError(f"Refusing to overwrite extracted assets: {paths}")


def save_crop(
    source: Image.Image,
    source_bbox,
    output_dir: Path,
    filename: str,
    padding: int,
    output_format: str,
):
    crop_bbox = padded_bbox(source_bbox, source.width, source.height, padding)
    output_path = output_dir / filename
    crop = source.crop(crop_bbox)
    if output_format == "webp":
        crop.save(output_path, "WEBP", quality=88, method=6)
    else:
        crop.save(output_path, "PNG", optimize=True)
    return {
        "file": filename,
        "sourceBbox": list(source_bbox),
        "cropBbox": list(crop_bbox),
        "width": crop_bbox[2] - crop_bbox[0],
        "height": crop_bbox[3] - crop_bbox[1],
    }


def extract_grid(args: argparse.Namespace, source: Image.Image):
    column_labels = []
    cell_labels = []
    if args.column_labels:
        column_labels = [
            label.strip() for label in args.column_labels.split(",") if label.strip()
        ]
        if len(column_labels) != args.cols:
            raise ValueError(
                f"Expected {args.cols} column labels, received {len(column_labels)}"
            )
    else:
        cell_labels = [
            label.strip() for label in args.cell_labels.split(",") if label.strip()
        ]
        expected = args.rows * args.cols
        if len(cell_labels) != expected:
            raise ValueError(
                f"Expected {expected} cell labels, received {len(cell_labels)}"
            )

    assets = []
    for row in range(args.rows):
        for column in range(args.cols):
            cell_bbox = (
                round(column * source.width / args.cols),
                round(row * source.height / args.rows),
                round((column + 1) * source.width / args.cols),
                round((row + 1) * source.height / args.rows),
            )
            cell = source.crop(cell_bbox)
            if args.largest_component:
                components = connected_component_bboxes(cell, min_pixels=64)
                local_bbox = max(components, key=lambda item: item[1])[0] if components else None
            else:
                local_bbox = alpha_bbox(cell)
            if not local_bbox:
                raise ValueError(f"Grid cell row={row} column={column} is empty")
            source_bbox = (
                cell_bbox[0] + local_bbox[0],
                cell_bbox[1] + local_bbox[1],
                cell_bbox[0] + local_bbox[2],
                cell_bbox[1] + local_bbox[3],
            )
            label = (
                cell_labels[row * args.cols + column]
                if cell_labels
                else column_labels[column]
            )
            filename = (
                f"{args.prefix}-{label}.{args.output_format}"
                if cell_labels
                else f"{args.prefix}-{row + 1:02d}-{label}.{args.output_format}"
            )
            asset = save_crop(
                source,
                source_bbox,
                args.output_dir,
                filename,
                args.padding,
                args.output_format,
            )
            asset.update({"row": row, "column": column, "label": label})
            assets.append(asset)
    return assets


def connected_component_bboxes(source: Image.Image, min_pixels: int):
    alpha = source.getchannel("A")
    width, height = source.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components = []

    for y in range(height):
        row_offset = y * width
        for x in range(width):
            index = row_offset + x
            if visited[index] or pixels[x, y] <= ALPHA_THRESHOLD:
                visited[index] = 1
                continue

            queue = deque([(x, y)])
            visited[index] = 1
            left = right = x
            top = bottom = y
            count = 0

            while queue:
                current_x, current_y = queue.popleft()
                count += 1
                left = min(left, current_x)
                right = max(right, current_x)
                top = min(top, current_y)
                bottom = max(bottom, current_y)

                for next_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                    next_offset = next_y * width
                    for next_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                        next_index = next_offset + next_x
                        if visited[next_index]:
                            continue
                        visited[next_index] = 1
                        if pixels[next_x, next_y] > ALPHA_THRESHOLD:
                            queue.append((next_x, next_y))

            if count >= min_pixels:
                components.append(((left, top, right + 1, bottom + 1), count))

    components.sort(key=lambda item: (item[0][1], item[0][0]))
    return components


def extract_components(args: argparse.Namespace, source: Image.Image):
    components = connected_component_bboxes(source, args.min_pixels)
    if not components:
        raise ValueError("No connected components met the extraction threshold")

    assets = []
    for index, (source_bbox, pixel_count) in enumerate(components, start=1):
        filename = f"{args.prefix}-{index:03d}.{args.output_format}"
        asset = save_crop(
            source,
            source_bbox,
            args.output_dir,
            filename,
            args.padding,
            args.output_format,
        )
        asset["alphaPixels"] = pixel_count
        assets.append(asset)
    return assets


def main() -> None:
    args = parse_args()
    if not args.input.is_file():
        raise FileNotFoundError(args.input)

    source = Image.open(args.input).convert("RGBA")
    prepare_output_dir(args.output_dir)
    assets = (
        extract_grid(args, source)
        if args.mode == "grid"
        else extract_components(args, source)
    )
    manifest = {
        "version": 1,
        "mode": args.mode,
        "source": args.input.as_posix(),
        "sourceWidth": source.width,
        "sourceHeight": source.height,
        "alphaThreshold": ALPHA_THRESHOLD,
        "padding": args.padding,
        "largestComponent": bool(getattr(args, "largest_component", False)),
        "outputFormat": args.output_format,
        "assetCount": len(assets),
        "assets": assets,
    }
    manifest_path = args.output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "manifest": manifest_path.as_posix(),
                "assetCount": len(assets),
            }
        )
    )


if __name__ == "__main__":
    main()
