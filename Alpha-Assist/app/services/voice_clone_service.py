"""XTTS-v2 voice cloning + Supabase Storage integration.

Reference samples live in the `voice-samples` bucket (path: `{user_id}/sample.wav`).
The TTS model is lazy-loaded. If it fails to load or synthesise, we fall back
to OpenAI TTS so voice chat never breaks outright.
"""
import io
import logging
import os
import tempfile
import warnings

warnings.filterwarnings(
    "ignore",
    message="The attention mask is not set and cannot be inferred from input",
)

from pydub import AudioSegment

logger = logging.getLogger(__name__)

# ── Patch torchaudio.load to use soundfile (torchcodec DLLs unavailable on Windows) ──
def _patch_torchaudio_load() -> None:
    try:
        import torch
        import numpy as np
        import soundfile as sf
        import torchaudio

        def _sf_load(uri, frame_offset=0, num_frames=-1, normalize=True,
                     channels_first=True, format=None, buffer_size=4096, backend=None):
            data, sr = sf.read(str(uri), start=frame_offset,
                               frames=num_frames if num_frames > 0 else -1,
                               always_2d=True, dtype="float32")
            # data: (time, channels) → transpose to (channels, time) if needed
            tensor = torch.from_numpy(data.T.copy() if channels_first else data.copy())
            return tensor, sr

        torchaudio.load = _sf_load
        logger.info("[voice_clone] patched torchaudio.load → soundfile")

        # Also patch the torchcodec wrapper if present — silently skip if not installed
        try:
            import torchaudio._torchcodec as _tc
            torchaudio._torchcodec.load_with_torchcodec = _sf_load
            _tc.load_with_torchcodec = _sf_load
            logger.info("[voice_clone] patched torchaudio._torchcodec.load_with_torchcodec → soundfile")
        except Exception:
            pass

    except Exception as e:
        logger.warning("[voice_clone] could not patch torchaudio.load: %s", e)

_patch_torchaudio_load()

_tts_model = None
_model_load_error: str | None = None


def _patch_transformers_beam_search() -> None:
    """Inject BeamSearchScorer into transformers so Coqui TTS can import it.

    transformers >= 4.45 removed it from the public API. Its __init__ uses
    __getattr__ so hasattr() returns True but the actual import still raises
    ImportError. We must force-inject it into sys.modules['transformers'].
    """
    import sys
    import transformers as _tf

    # Try to actually do the import that Coqui TTS will attempt
    try:
        from transformers import BeamSearchScorer  # noqa: F401
        logger.info("[voice_clone] BeamSearchScorer already importable — no patch needed")
        return
    except (ImportError, AttributeError):
        pass  # needs patching

    # Try to find the real class in the generation submodule
    _BSS = None
    for mod_path in (
        "transformers.generation.beam_search",
        "transformers.generation.utils",
        "transformers.generation",
    ):
        try:
            import importlib
            mod = importlib.import_module(mod_path)
            if hasattr(mod, "BeamSearchScorer"):
                _BSS = mod.BeamSearchScorer
                break
        except Exception:
            continue

    # Fall back to a minimal stub so the import succeeds even if unused
    if _BSS is None:
        class _BSS:  # type: ignore[no-redef]
            """Stub — BeamSearchScorer not found in this transformers version."""
            def __init__(self, *args, **kwargs): pass
            def process(self, *args, **kwargs): return {}
            def finalize(self, *args, **kwargs): return {}
            @property
            def is_done(self): return True

        logger.warning("[voice_clone] BeamSearchScorer not found — using stub")
    else:
        logger.info("[voice_clone] patched transformers.BeamSearchScorer from submodule")

    # Inject into the live module object AND sys.modules so all import paths work
    _tf.BeamSearchScorer = _BSS
    sys.modules["transformers"].BeamSearchScorer = _BSS


_patch_transformers_beam_search()


def reset_model_cache() -> None:
    """Force a reload attempt on next call (useful after fixing dependencies)."""
    global _tts_model, _model_load_error
    _tts_model = None
    _model_load_error = None


def _has_gpu() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


def _get_model():
    """Lazy-load XTTS-v2. Returns None (silently) on failure so callers can fall back to OpenAI TTS."""
    global _tts_model, _model_load_error
    if _tts_model is not None:
        return _tts_model
    if _model_load_error:
        # Already failed once — don't spam logs on every request
        return None
    try:
        # PyTorch 2.6 changed weights_only default to True which breaks XTTS.
        # Patch torch.load to keep weights_only=False for trusted model files.
        import torch
        import functools
        _original_torch_load = torch.load

        @functools.wraps(_original_torch_load)
        def _patched_torch_load(*args, **kwargs):
            kwargs.setdefault("weights_only", False)
            return _original_torch_load(*args, **kwargs)

        torch.load = _patched_torch_load

        from TTS.api import TTS  # type: ignore
        logger.info("[voice_clone] loading XTTS-v2…")
        _tts_model = TTS(
            model_name="tts_models/multilingual/multi-dataset/xtts_v2",
            progress_bar=False,
            gpu=_has_gpu(),
        )
        torch.load = _original_torch_load  # restore after loading
        logger.info("[voice_clone] XTTS-v2 ready.")
        return _tts_model
    except Exception as e:
        _model_load_error = str(e)
        logger.error("[voice_clone] failed to load XTTS-v2: %s", e)
        return None


# ───────────────────────────────────────────────────────────────────────────
# Audio conversion helper (used when uploading a reference sample)
# ───────────────────────────────────────────────────────────────────────────
def to_clean_wav_bytes(audio_bytes: bytes, original_filename: str) -> bytes:
    """Convert any common audio format to mono 22 050 Hz WAV in-memory."""
    if not audio_bytes:
        raise ValueError("empty audio")

    suffix = os.path.splitext(original_filename)[1].lower() or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        seg = AudioSegment.from_file(tmp_path)
        seg = seg.set_channels(1).set_frame_rate(22050)
        out = io.BytesIO()
        seg.export(out, format="wav")
        return out.getvalue()
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


# ───────────────────────────────────────────────────────────────────────────
# Synthesis
# ───────────────────────────────────────────────────────────────────────────
def synthesise(text: str, sample_path: str, language: str = "en") -> bytes:
    """Generate WAV bytes using XTTS-v2 + the given speaker sample file."""
    model = _get_model()
    if model is None or not os.path.exists(sample_path):
        logger.warning("[voice_clone] XTTS unavailable → OpenAI TTS fallback")
        return _openai_tts_fallback(text)

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as out_tmp:
            out_path = out_tmp.name
        model.tts_to_file(text=text, speaker_wav=sample_path,
                          language=language, file_path=out_path)
        with open(out_path, "rb") as f:
            wav = f.read()
        os.remove(out_path)
        return wav
    except Exception as e:
        logger.error("[voice_clone] XTTS synthesis error: %s", e)
        return _openai_tts_fallback(text)


def _is_mp3(data: bytes) -> bool:
    """Return True if data looks like an MP3 stream (ID3 tag or sync frame)."""
    return (
        data[:3] == b"ID3"
        or (len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)
    )


def synthesise_to_file(
    text: str, sample_path: str, out_path: str, language: str = "en",
) -> str:
    """Synthesise speech and write it to out_path. Returns the final path."""
    audio_bytes = synthesise(text, sample_path, language)

    # If the fallback returned MP3 bytes, write them directly as .mp3
    if _is_mp3(audio_bytes):
        mp3_path = out_path if out_path.endswith(".mp3") else out_path.replace(".wav", ".mp3")
        with open(mp3_path, "wb") as f:
            f.write(audio_bytes)
        return mp3_path

    # XTTS returned real WAV — convert to MP3 if possible
    if out_path.endswith(".mp3"):
        try:
            seg = AudioSegment.from_wav(io.BytesIO(audio_bytes))
            seg.export(out_path, format="mp3")
            return out_path
        except Exception as e:
            logger.warning("[voice_clone] WAV→MP3 failed: %s — writing .wav", e)
            out_path = out_path.replace(".mp3", ".wav")

    with open(out_path, "wb") as f:
        f.write(audio_bytes)
    return out_path


def _openai_tts_fallback(text: str) -> bytes:
    try:
        from openai import OpenAI
        from ..config import OPENAI_API_KEY
        client = OpenAI(api_key=OPENAI_API_KEY)
        resp = client.audio.speech.create(
            model="tts-1", voice="alloy", input=text, response_format="mp3",
        )
        return resp.read()
    except Exception as e:
        logger.error("[voice_clone] OpenAI TTS fallback failed: %s", e)
        return b""
