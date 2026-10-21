# HOUSEVOICE Wake-Word Training Package

This package prepares a reproducible `HOUSEVOICE` OpenWakeWord model for Graham's VACA device without installing a training stack on Home Assistant.

## Chosen path

Use `train_housevoice_colab.ipynb` on an external Google Colab GPU. It is a HOUSEVOICE-customized copy of the MIT-licensed `pafernanr/openwakeword-colab-2026` notebook pinned to commit:

```text
393d06d1beeddf8cff370e79ed8c209d4e803319
```

The upstream copyright and MIT terms are retained in `LICENSE.upstream`.

The notebook is preconfigured with:

```python
TARGET_PHRASE = ["house voice"]
MODEL_NAME = "housevoice"
LANGUAGE = "en_US"
```

Notebook SHA-256:

```text
af4f1533a862c1f5fb4b52e7cf54a3285087c9357d369fe9dd6b459eb5db8658
```

The notebook pins:

- Colab runtime `2026.07`: Python `3.12.13`, NumPy `2.0.2`, PyTorch/Torchaudio `2.11.0`.
- `piper-tts==1.3.0`, which embeds eSpeak phonemization.
- `transformers==4.57.6` with `huggingface-hub==0.34.4`.
- `speechbrain==1.1.2`, which supports Torchaudio 2.9+ without `list_audio_backends()`.
- `torch-audiomentations==0.12.0`, which removed the obsolete backend setter.
- Piper sample generator source commit `2971426a55072f7d22fec416ca7800df8bd23207`.
- OpenWakeWord commit `368c03716d1e92591906a84949bc477f3a834455`.

The Piper sample generator is restored from its exact commit archive rather than installed from PyPI. Its `3.2.0` wheel omits the bundled `piper_train` package, as documented by upstream issue #20. The notebook does not install `piper-phonemize-cross`, Torch, Torchvision, or CUDA packages.

The official OpenWakeWord notebook that attempted `torchvision==0.20.0` and CUDA 12.1 packages is not compatible with a Python 3.13 Colab runtime. Do not try to repair that environment in place.

## Train externally

1. Upload `train_housevoice_colab.ipynb` to Google Colab.
2. Before connecting, choose **Runtime → Change runtime type**.
3. Select runtime **2026.07** and a **T4 GPU**. L4 is also compatible.
4. Confirm that Google Drive has at least **35 GB free**. Step 0 mounts Drive and creates `MyDrive/HOUSEVOICE_Wakeword/`.
5. Run Steps 0–3. Approve the Google Drive mount when prompted.
6. Confirm Pre-flight reports Python 3.12, NumPy 2.0.2, Torch/Torchaudio 2.11.0, CUDA available, both pinned source commits, and all dependency regression checks passing.
7. Run Step 4, play the generated WAV, and type `HOUSEVOICE` only if it clearly says “house voice.” This required smoke test still runs after every new runtime.
8. Run Step 5. Large downloads write to Drive as `.part` files, resume with HTTP Range requests, and are renamed only after exact-size and format checks pass.
9. Continue through Steps 6–9. The final `housevoice.onnx`, `housevoice.tflite`, metrics, and hashes remain in the run directory in Drive even if browser download fails.
10. Record the notebook SHA-256, model SHA-256, training metrics, and date in `MODEL_CARD.md`.

This revision has been statically checked but has **not** been executed in Google Colab by the Home Assistant agent. Drive mounting, downloading, training resume, and export still require user-side Colab validation.

## What persists in Google Drive

The notebook stores durable state under `MyDrive/HOUSEVOICE_Wakeword/`:

- `cache/`: pip and Hugging Face caches, including MIT impulse-response source data.
- `sources/`: exact pinned source archives.
- `models/`: Piper voices and shared OpenWakeWord embedding/mel models.
- `datasets/`: ACAV, extracted FMA, converted 16-kHz audio, MIT RIR WAVs, and ACAV subsets.
- `runs/housevoice-<run-id>/`: config, generated clips, augmented features, exports, metrics, and hashes.
- `checkpoints/`: an atomic rolling training checkpoint saved every 250 steps and at stage boundaries.

The FMA ZIP is removed only after every member has been CRC-checked, atomically extracted, and recorded in a persistent size manifest. The extracted dataset remains. The original ACAV file is retained after subset creation so corrupt or missing subsets can be rebuilt without another 17.28 GB download.

## Reconnect after Colab terminates the runtime

Do not use the old disconnected tab as proof that the runtime can be recovered. Start or reconnect a runtime with the required image, then:

1. Select runtime **2026.07** and a **T4 or L4 GPU**.
2. Run Step **0** and authorize the same Google Drive account. Confirm it prints `MyDrive/HOUSEVOICE_Wakeword`.
3. Run Step **1**. Apt packages are reinstalled because the VM is new; pip reuses its Drive cache and verifies that Torch/Torchaudio remain 2.11.0.
4. Run Step **2**. It restores clean disposable source trees from Drive and reuses the persistent Piper voice.
5. Run Step **3** and require a complete Pre-flight pass.
6. Run Step **4**, listen again, and type `HOUSEVOICE`.
7. Run Step **5**. Complete files print `cached + verified`; interrupted files resume from their Drive `.part` byte count. FMA and MIT extraction skip valid completed members.
8. Run Step **6**. Existing valid FMA WAVs and ACAV subsets are reused.
9. Run Step **7**. Existing generated clips are validated and reused.
10. Run Step **8**. It prints `RESUME checkpoint: stage=..., next_step=...` when a compatible checkpoint exists, then continues from that stage and step.
11. Run Step **9** after training completes. Exports and metrics are already in Drive before browser downloads start.

A normal runtime termination does not require deleting the Drive workspace. Use **Disconnect and delete runtime** only when the base image or installed environment is contaminated; deleting the runtime still does not delete Drive data.

If a `.part` file fails validation, leave it in place and rerun the same step. The downloader retries six times and retains the verified byte prefix. If the server ignores Range requests, the notebook restarts only that one file rather than appending incompatible data.

## Colab troubleshooting

### Google Drive is full

Stop before Step 5. This workflow needs approximately 35 GB free because it retains the 17.28 GB ACAV source, extracted FMA data, prepared subsets, clips, features, and checkpoints. Do not redirect only part of the workspace back to `/content`; that would make recovery incomplete.

### A checkpoint is renamed `invalid-<timestamp>.pt`

The checkpoint was unreadable or belonged to a different configuration/feature generation. It is preserved for diagnosis, but training starts from stage 1 rather than loading incompatible weights. Do not rename it back over the active checkpoint.

### Python 3.13 or `No matching distribution for piper-phonemize-cross`

You are in the wrong runtime or running the obsolete official notebook. Disconnect, select runtime version **2026.07**, reconnect, and start this packaged notebook from the first cell. Do not install `piper-phonemize-cross`; it has no CPython 3.13 wheel and is not used by Piper 1.3.0.

### `No matching distribution for torchvision==0.20.0` or CUDA 12.1 downloads

Stop the run and factory-reset the Colab runtime. This notebook never requests Torchvision, Torch, or CUDA wheels. Seeing those packages means cells from the obsolete notebook are still running or the runtime was contaminated.

### Base-version validation fails

Use **Runtime → Disconnect and delete runtime**, then reselect runtime version **2026.07** and a GPU. Do not use `pip install --upgrade torch`, NumPy, or Torchaudio.

### TorchMetrics fails importing `is_offline_mode`

This means Transformers 5.x from the Colab image is still paired with `huggingface-hub==0.34.4`. Rerun Step 1 in the current notebook. The supported resolution is `transformers==4.57.6` with Hub 0.34.4; do not add `is_offline_mode` to Hugging Face Hub manually.

### SpeechBrain calls `torchaudio.list_audio_backends()`

SpeechBrain 1.0.3 is still loaded. Upgrade to the pinned `speechbrain==1.1.2`, clear failed SpeechBrain modules, and rerun Pre-flight. Version 1.1.2 contains the released Torchaudio 2.9+ guard and SoundFile audio adapter; do not add a fake `list_audio_backends` function.

### `ModuleNotFoundError: piper_train`

Rerun Step 2. It must report Piper sample generator commit `2971426a55072f7d22fec416ca7800df8bd23207`. Step 2 restores the disposable `/content/piper-sample-generator` tree from the verified Drive source archive. Do not install the `piper-sample-generator==3.2.0` wheel as a workaround; that wheel is the source of the missing module.

### `ModuleNotFoundError: piper_phonemize`

The obsolete generator code is being imported. The pinned source uses `piper.phonemize_espeak` from `piper-tts==1.3.0`. Factory-reset the runtime and rerun this notebook from the top.

### Speech smoke test fails or sounds wrong

Do not start the large downloads. Save the complete Install, Clone, Pre-flight, and speech-cell output. Confirm Step 2 reports the persistent Piper model under `MyDrive/HOUSEVOICE_Wakeword/models/piper/`. Rerun Step 2 once; if it still fails, report the exact traceback and the displayed version/commit lines.

### Runtime version 2026.07 is unavailable

Stop rather than substituting the latest Python 3.13 image. Colab currently lists past runtimes under **Runtime → Change runtime type**; this workflow has not been validated against another image.

Do not treat notebook validation metrics as deployment proof. Graham's room, microphone, television, music, and family speech are the acceptance environment.

## Collect Graham-specific validation audio

Use `capture_graham_sample.js` only while Graham is present and knows a recording is being made. The script:

- Verifies local CDP port `9225` is Graham's `/kids-rooms/grahams-room` WebView.
- Shows a visible three-second countdown and recording banner on Graham's screen.
- Records only the requested short sample.
- Stops every microphone track and removes the banner.
- Saves 16 kHz, mono, 16-bit PCM WAV locally.

Positive examples should include at least 20 natural HOUSEVOICE utterances across:

- Near, medium, and far distances.
- Quiet room, HVAC noise, television, and music.
- Normal, soft, loud, fast, and slow speech.
- Graham and other intended household speakers.

Example:

```bash
node capture_graham_sample.js \
  --label positive \
  --name graham-near-normal-01 \
  --seconds 3 \
  --confirm-recording
```

For false-activation testing, capture representative ambient clips only with everyone present informed. Prefer several longer clips rather than many tiny clips:

```bash
node capture_graham_sample.js \
  --label negative \
  --name tv-conversation-01 \
  --seconds 120 \
  --confirm-recording
```

Record deliberately confusing phrases separately, including `house`, `voice`, `house boys`, `house choice`, and ordinary sentences containing both words without using them as a wake command.

Audio under `samples/` is ignored by Git and must not be committed.

## Evaluate before deployment

Run evaluation on a disposable external Python environment, not Home Assistant:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install \
  "openwakeword @ git+https://github.com/dscripka/openWakeWord.git@368c03716d1e92591906a84949bc477f3a834455" \
  onnxruntime numpy
python evaluate_openwakeword.py \
  --model housevoice.onnx \
  --positive-dir samples/positive \
  --negative-dir samples/negative \
  --output results/housevoice-evaluation.json
```

Initial acceptance targets:

- At least 90% detection on intended positive samples at the chosen threshold.
- No false activation in at least 60 minutes of representative Graham-room negatives.
- No activation on the deliberately confusing phrases.
- Twenty consecutive live wake attempts at Graham's normal speaking distance with at least 18 successes.

The evaluator reports threshold tradeoffs. Start deployment testing around model score `0.5`; VACA exposes its own `0–10` wake-word threshold control, so tune on the device and record the exact VACA value. Do not assume its displayed value is the raw ONNX score.

## Deploy to Graham only

After the model passes offline evaluation:

1. Calculate and record its SHA-256.
2. Copy it to:

   ```text
   /homeassistant/vaca/custom/openwakeword/housevoice.onnx
   ```

3. In Graham's VACA only, use **Quick Actions → Settings → Manage Custom Files** to sync custom files, or restart Graham's VACA app.
4. Keep the engine at `openwakeword`.
5. Confirm `HOUSEVOICE` appears in Graham's wake-word selector before selecting it.
6. Test at a conservative threshold while Walkie is idle.
7. Test positive recall, confusing phrases, television/music false activations, incoming/outgoing Walkie, timer acknowledgement, and recovery.
8. Do not deploy to Parents or Cora until Graham's acceptance targets pass.

## Rollback

1. Set `select.vaca_96ed4d2c4_wake_word` to `None`.
2. Confirm Graham's Walkie card is idle and can complete a test call.
3. Remove or quarantine `housevoice.onnx` only after the selector no longer uses it.
4. Sync VACA custom files again.

No Home Assistant restart is required for selector or threshold changes. Model discovery requires a VACA custom-file sync or VACA app restart.
