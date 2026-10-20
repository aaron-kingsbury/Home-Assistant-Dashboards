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
54f85dead02e639605a7adca78713b8347cf2b62b212c1eec5e4665004c2696f
```

The notebook pins:

- Colab runtime `2026.07`: Python `3.12.13`, NumPy `2.0.2`, PyTorch/Torchaudio `2.11.0`.
- `piper-tts==1.3.0`, which embeds eSpeak phonemization.
- `transformers==4.57.6` with `huggingface-hub==0.34.4`.
- `speechbrain==1.1.2`, which supports Torchaudio 2.9+ without `list_audio_backends()`.
- `torch-audiomentations==0.12.0`, which removed the obsolete backend setter.
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

## Repair an existing 2026.07 Colab session

If Configure, Install, and Clone from the previous notebook revision already completed, retain the current runtime and `/content` downloads. Run this small package correction in a new cell:

```python
import subprocess, sys

subprocess.run([
    sys.executable, "-m", "pip", "install",
    "--disable-pip-version-check",
    "--constraint", "/content/housevoice-constraints.txt",
    "huggingface-hub==0.34.4",
    "transformers==4.57.6",
    "speechbrain==1.1.2",
    "torch-audiomentations==0.12.0",
], check=True)
```

Then run this compatibility and regression cell. It updates only the disposable OpenWakeWord checkout, removes the earlier notebook's Torchaudio shim if present, and reuses the downloaded Piper model:

```python
import importlib
import inspect
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio

for prefix in ("transformers", "torchmetrics", "speechbrain", "openwakeword", "torch_audiomentations"):
    for module_name in list(sys.modules):
        if module_name == prefix or module_name.startswith(prefix + "."):
            del sys.modules[module_name]
importlib.invalidate_caches()

# Remove the previous notebook's installed-package shim. OpenWakeWord is
# adapted below instead of changing Torchaudio globally.
torchaudio_init = Path(torchaudio.__file__)
old_marker = "# -- PATCH: info() shim for torchaudio 2.x --"
torchaudio_text = torchaudio_init.read_text()
if old_marker in torchaudio_text:
    torchaudio_init.write_text(torchaudio_text.split(old_marker, 1)[0].rstrip() + "\n")
    if hasattr(torchaudio, "info"):
        delattr(torchaudio, "info")

data_path = Path("/content/openwakeword/openwakeword/data.py")
data_text = data_path.read_text()
marker = "# -- HOUSEVOICE SoundFile compatibility for Torchaudio 2.11 --"
if marker not in data_text:
    helper = r'''
# -- HOUSEVOICE SoundFile compatibility for Torchaudio 2.11 --
import types as _types
import soundfile as _soundfile

def _housevoice_audio_info(file_path, *args, **kwargs):
    info = _soundfile.info(str(file_path))
    return _types.SimpleNamespace(
        num_frames=info.frames, sample_rate=info.samplerate,
        num_channels=info.channels, bits_per_sample=16, encoding="PCM_S")

def _housevoice_load_audio(file_path, frame_offset=0, num_frames=-1, *args, **kwargs):
    frames = -1 if num_frames is None or num_frames < 0 else num_frames
    audio, sample_rate = _soundfile.read(
        str(file_path), start=frame_offset, frames=frames,
        dtype="float32", always_2d=True)
    return torch.from_numpy(audio.T.copy()), sample_rate
'''
    data_text = data_text.replace("import torchaudio\n", "import torchaudio\n" + helper + "\n", 1)
data_text = data_text.replace("torchaudio.info(", "_housevoice_audio_info(")
data_text = data_text.replace("torchaudio.load(", "_housevoice_load_audio(")
data_path.write_text(data_text)

for prefix in ("transformers", "torchmetrics", "speechbrain", "openwakeword", "torch_audiomentations"):
    for module_name in list(sys.modules):
        if module_name == prefix or module_name.startswith(prefix + "."):
            del sys.modules[module_name]
importlib.invalidate_caches()

from transformers.utils.hub import is_offline_mode
import torchmetrics
from speechbrain.dataio.dataio import read_audio
from speechbrain.utils.torch_audio_backend import check_torchaudio_backend

assert callable(is_offline_mode)
check_torchaudio_backend()
with tempfile.NamedTemporaryFile(suffix=".wav") as test_wav:
    sf.write(test_wav.name, np.zeros(1600, dtype=np.float32), 16000)
    assert tuple(read_audio(test_wav.name).shape) == (1600,)

from openwakeword.data import generate_adversarial_texts, augment_clips, mmap_batch_generator
from openwakeword.utils import compute_features_from_generator, AudioFeatures
assert "torchaudio.info(" not in data_path.read_text()
assert "torchaudio.load(" not in data_path.read_text()

print("PASS: Transformers/TorchMetrics, SpeechBrain/Torchaudio, and OpenWakeWord imports")
_STEP_2_OK = True
_STEP_3_OK = True
```

If both cells pass, run the existing **HOUSEVOICE speech smoke test** next. Do not rerun Configure or download the Piper model again. A runtime restart should not be necessary. If Python reports that newly installed code cannot replace an already imported module, clear the failed modules as shown above and rerun the regression cell once; restart only if that still fails.

## Colab troubleshooting

### Python 3.13 or `No matching distribution for piper-phonemize-cross`

You are in the wrong runtime or running the obsolete official notebook. Disconnect, select runtime version **2026.07**, reconnect, and start this packaged notebook from the first cell. Do not install `piper-phonemize-cross`; it has no CPython 3.13 wheel and is not used by Piper 1.3.0.

### `No matching distribution for torchvision==0.20.0` or CUDA 12.1 downloads

Stop the run and factory-reset the Colab runtime. This notebook never requests Torchvision, Torch, or CUDA wheels. Seeing those packages means cells from the obsolete notebook are still running or the runtime was contaminated.

### Base-version validation fails

Use **Runtime → Disconnect and delete runtime**, then reselect runtime version **2026.07** and a GPU. Do not use `pip install --upgrade torch`, NumPy, or Torchaudio.

### TorchMetrics fails importing `is_offline_mode`

This means Transformers 5.x from the Colab image is still paired with `huggingface-hub==0.34.4`. Use the current-session repair above or rerun the updated Install cell. The supported resolution is `transformers==4.57.6` with Hub 0.34.4; do not add `is_offline_mode` to Hugging Face Hub manually.

### SpeechBrain calls `torchaudio.list_audio_backends()`

SpeechBrain 1.0.3 is still loaded. Upgrade to the pinned `speechbrain==1.1.2`, clear failed SpeechBrain modules, and rerun Pre-flight. Version 1.1.2 contains the released Torchaudio 2.9+ guard and SoundFile audio adapter; do not add a fake `list_audio_backends` function.

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
