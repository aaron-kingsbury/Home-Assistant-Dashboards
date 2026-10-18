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
b6adcdde2fe19a145bcc8628b304b662c5c2c8070aa84fbaa21a307eda53cb7a
```

The notebook also pins OpenWakeWord itself to commit `368c03716d1e92591906a84949bc477f3a834455` instead of following a changing `master` branch.

The current official OpenWakeWord notebook is not the recommended route because its older dependency pins fail on modern Colab images. The hosted OpenWakeWord Training Center is simpler, but it requires an account and is less reproducible. The packaged notebook can use a free Colab T4; Colab Pro is optional.

## Train externally

1. Download `train_housevoice_colab.ipynb` from this directory.
2. Upload it to Google Colab.
3. Select **Runtime → Change runtime type → T4 GPU**. High RAM/L4 can reduce runtime but is not required.
4. Run all cells without changing the preconfigured phrase, model name, or language.
5. Download the generated `housevoice.onnx`. Keep the generated metrics and `housevoice.tflite` as training artifacts.
6. Record the notebook commit, notebook SHA-256, model SHA-256, training metrics, and date in `MODEL_CARD.md`.

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
