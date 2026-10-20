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
ac567ee3e96a145795afcab19dfc33132d95bfaa695777eae0ad80a07da7f433
```

The notebook pins:

- Colab runtime `2026.07`: Python `3.12.13`, NumPy `2.0.2`, PyTorch/Torchaudio `2.11.0`.
- `piper-tts==1.3.0`, which embeds eSpeak phonemization.
- Piper sample generator source commit `2971426a55072f7d22fec416ca7800df8bd23207`.
- OpenWakeWord commit `368c03716d1e92591906a84949bc477f3a834455`.

The Piper sample generator is cloned from its tagged source rather than installed from PyPI. Its `3.2.0` wheel omits the bundled `piper_train` package, as documented by upstream issue #20. The notebook does not install `piper-phonemize-cross`, Torch, Torchvision, or CUDA packages.

The official OpenWakeWord notebook that attempted `torchvision==0.20.0` and CUDA 12.1 packages is not compatible with a Python 3.13 Colab runtime. Do not try to repair that environment in place.

## Train externally

1. Download `train_housevoice_colab.ipynb` from this directory and upload it to Google Colab.
2. Before connecting, choose **Runtime → Change runtime type**.
3. Set **Runtime Version** to **2026.07** and select a **T4 GPU**. L4 is also compatible.
4. Connect and run the Configure, Install, Clone, and Pre-flight cells in order.
5. Confirm the pre-flight reports Python 3.12, NumPy 2.0.2, Torch/Torchaudio 2.11.0, CUDA available, and both pinned Git commits.
6. Run the **HOUSEVOICE speech smoke test**. Play the generated WAV. If it clearly says HOUSEVOICE, type `HOUSEVOICE` at the prompt. Do not continue if it is silent, corrupted, or pronounces the wrong phrase.
7. Continue with the large downloads and full training only after the speech gate passes.
8. Download the generated `housevoice.onnx`. Keep the metrics and `housevoice.tflite` as training artifacts.
9. Record the notebook SHA-256, model SHA-256, training metrics, and date in `MODEL_CARD.md`.

This revision has been statically checked but has **not** been executed in Google Colab by the Home Assistant agent. A passing speech gate proves dependency setup and Piper synthesis, not full model training.

## Colab troubleshooting

### Python 3.13 or `No matching distribution for piper-phonemize-cross`

You are in the wrong runtime or running the obsolete official notebook. Disconnect, select runtime version **2026.07**, reconnect, and start this packaged notebook from the first cell. Do not install `piper-phonemize-cross`; it has no CPython 3.13 wheel and is not used by Piper 1.3.0.

### `No matching distribution for torchvision==0.20.0` or CUDA 12.1 downloads

Stop the run and factory-reset the Colab runtime. This notebook never requests Torchvision, Torch, or CUDA wheels. Seeing those packages means cells from the obsolete notebook are still running or the runtime was contaminated.

### Base-version validation fails

Use **Runtime → Disconnect and delete runtime**, then reselect runtime version **2026.07** and a GPU. Do not use `pip install --upgrade torch`, NumPy, or Torchaudio.

### `ModuleNotFoundError: piper_train`

Rerun the Clone cell. It must report Piper sample generator commit `2971426a55072f7d22fec416ca7800df8bd23207`. If a prior partial checkout remains, delete only `/content/piper-sample-generator` in the disposable Colab runtime and rerun that cell. Do not install the `piper-sample-generator==3.2.0` wheel as a workaround; that wheel is the source of the missing module.

### `ModuleNotFoundError: piper_phonemize`

The obsolete generator code is being imported. The pinned source uses `piper.phonemize_espeak` from `piper-tts==1.3.0`. Factory-reset the runtime and rerun this notebook from the top.

### Speech smoke test fails or sounds wrong

Do not start the large downloads. Save the complete Install, Clone, Pre-flight, and speech-cell output. Confirm that `/content/piper-sample-generator/models/en_US-libritts_r-medium.pt` is larger than 100 MB and that its adjacent `.json` file exists. Rerun the Clone cell once; if it still fails, report the exact traceback and the displayed version/commit lines.

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
