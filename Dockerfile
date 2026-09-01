FROM python:3.10-slim

WORKDIR /app

# Install dependencies as root
COPY requirements.txt .
RUN pip install -r requirements.txt --break-system-packages

# Hugging Face Spaces requires running as a non-root user (UID 1000)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Pre-download the embedding model into the user's cache
RUN python -c "from llama_index.embeddings.huggingface import HuggingFaceEmbedding; HuggingFaceEmbedding(model_name='BAAI/bge-base-en-v1.5', device='cpu')"

# Copy the rest of the app, ensuring the new user owns the files
COPY --chown=user . $HOME/app

# Default port (Render sets PORT=10000, HF Spaces uses 7860)
ENV PORT=7860
EXPOSE ${PORT}
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]

