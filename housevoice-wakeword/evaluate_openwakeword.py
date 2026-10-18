#!/usr/bin/env python3
"""Evaluate an OpenWakeWord ONNX model against positive and negative WAV clips."""

from __future__ import annotations

import argparse
import json
import math
import wave
from pathlib import Path

from openwakeword.model import Model


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wav_file:
        if wav_file.getnchannels() != 1:
            raise ValueError(f"{path}: expected mono WAV")
        if wav_file.getframerate() != 16000:
            raise ValueError(f"{path}: expected 16 kHz WAV")
        if wav_file.getsampwidth() != 2:
            raise ValueError(f"{path}: expected 16-bit PCM WAV")
        return wav_file.getnframes() / wav_file.getframerate()


def score_clip(model: Model, path: Path) -> tuple[list[float], float]:
    model.reset()
    predictions = model.predict_clip(str(path), padding=1, chunk_size=1280)
    if not predictions:
        raise ValueError(f"{path}: clip produced no prediction frames")
    keys = sorted({key for frame in predictions for key in frame})
    if len(keys) != 1:
        raise ValueError(f"{path}: expected one model output, got {keys}")
    scores = [float(frame[keys[0]]) for frame in predictions]
    return scores, wav_duration(path)


def count_events(scores: list[float], threshold: float, cooldown_frames: int) -> int:
    events = 0
    blocked_until = -1
    for index, score in enumerate(scores):
        if index >= blocked_until and score >= threshold:
            events += 1
            blocked_until = index + cooldown_frames
    return events


def wav_files(directory: Path) -> list[Path]:
    return sorted(path for path in directory.rglob("*.wav") if path.is_file())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--positive-dir", required=True, type=Path)
    parser.add_argument("--negative-dir", required=True, type=Path)
    parser.add_argument(
        "--thresholds",
        default="0.3,0.4,0.5,0.6,0.7,0.8",
        help="Comma-separated model score thresholds",
    )
    parser.add_argument("--cooldown-seconds", type=float, default=2.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    thresholds = [float(value) for value in args.thresholds.split(",")]
    if not thresholds or any(value < 0 or value > 1 for value in thresholds):
        raise ValueError("Thresholds must be between 0 and 1")

    positives = wav_files(args.positive_dir)
    negatives = wav_files(args.negative_dir)
    if not positives:
        raise ValueError(f"No positive WAV files under {args.positive_dir}")
    if not negatives:
        raise ValueError(f"No negative WAV files under {args.negative_dir}")

    model = Model(wakeword_models=[str(args.model)], inference_framework="onnx")
    scored: dict[str, list[dict[str, object]]] = {"positive": [], "negative": []}
    for kind, paths in (("positive", positives), ("negative", negatives)):
        for path in paths:
            scores, duration = score_clip(model, path)
            scored[kind].append(
                {
                    "path": str(path),
                    "duration_seconds": duration,
                    "max_score": max(scores),
                    "scores": scores,
                }
            )

    cooldown_frames = max(1, math.ceil(args.cooldown_seconds / 0.08))
    negative_hours = sum(
        float(item["duration_seconds"]) for item in scored["negative"]
    ) / 3600
    metrics = []
    for threshold in thresholds:
        positive_hits = sum(
            float(item["max_score"]) >= threshold for item in scored["positive"]
        )
        false_events = sum(
            count_events(item["scores"], threshold, cooldown_frames)
            for item in scored["negative"]
        )
        metrics.append(
            {
                "threshold": threshold,
                "positive_hits": positive_hits,
                "positive_total": len(scored["positive"]),
                "positive_recall": positive_hits / len(scored["positive"]),
                "negative_hours": negative_hours,
                "false_activations": false_events,
                "false_activations_per_hour": (
                    false_events / negative_hours if negative_hours else None
                ),
            }
        )

    result = {
        "model": str(args.model),
        "cooldown_seconds": args.cooldown_seconds,
        "metrics": metrics,
        "clips": {
            kind: [
                {key: value for key, value in item.items() if key != "scores"}
                for item in items
            ]
            for kind, items in scored.items()
        },
    }

    print("threshold  recall  false_events  negative_hours  false_events/hour")
    for row in metrics:
        rate = row["false_activations_per_hour"]
        print(
            f"{row['threshold']:>9.2f}  "
            f"{row['positive_recall']:>6.1%}  "
            f"{row['false_activations']:>12}  "
            f"{row['negative_hours']:>14.3f}  "
            f"{rate if rate is not None else 'n/a'}"
        )

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
