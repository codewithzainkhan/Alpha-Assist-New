FROM python:3.11-slim

WORKDIR /app

# System dependencies:
#   ffmpeg          — audio conversion (pydub, whisper, torchaudio, librosa)
#   libsndfile1     — soundfile / pyannote / Coqui TTS
#   libgomp1        — OpenMP runtime (torch, umap-learn, numba)
#   libglib2.0-0    — required by torchvision / chromadb on Linux
#   libgl1          — required by torchvision headless
#   libsqlite3-0    — chromadb vector store (already in slim, explicit for clarity)
#   build-essential — compiling C extensions (numpy, tokenizers, Cython, etc.)
#   git             — some pip packages fetch from git at install time
#   curl            — Dockerfile HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        libgomp1 \
        libglib2.0-0 \
        libgl1 \
        libsqlite3-0 \
        build-essential \
        git \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (separate layer → cached unless requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
