# InsightAI — Adaptive RAG for Indian Health Insurance

InsightAI is a sophisticated Retrieval-Augmented Generation (RAG) pipeline designed to analyze and interpret Indian health insurance policy documents. It features a hybrid search engine, an automated auditing layer, and a minimalist, modern web interface.

---

## 🚀 Features

* **Adaptive RAG Pipeline**: Orchestrated using **LangGraph** to handle complex document queries with self-correction capabilities.
* **Hybrid Search**: Combines **Vector Semantic Search** (via HuggingFace embeddings) and **BM25 Keyword Search** using Weaviate for high-precision retrieval.
* **Intelligent Auditing**: Automated auditing of insurance policy clauses to ensure transparency and compliance.
* **Modern UI**: A minimalist React-based frontend featuring Glassmorphism, Bento grids, and fluid shaders for a premium user experience.
* **High Performance**: Powered by **FastAPI** on the backend and **Groq (Llama 3 models)** for near-instant inference.

---

## 🛠️ Tech Stack

### Backend
* **Framework**: FastAPI
* **Orchestration**: LangGraph, LangChain
* **LLM**: Groq (Llama 3.1 8B / 70B)
* **Vector Database**: Weaviate
* **RAG Framework**: LlamaIndex

### Frontend
* **Library**: React 19 with Vite
* **Styling**: Tailwind CSS & Framer Motion
* **Authentication**: Clerk
* **Database/Storage**: Supabase

---

## 📂 Project Structure

```text
├── app/
│   ├── api/          # FastAPI routes and endpoints
│   ├── core/         # Configuration and security
│   ├── services/     # Logic for LLM, Vector Store, and Ingestion
│   └── main.py       # Application entry point
├── frontend/         # React + Vite source code
├── storage/          # Local metadata and index persistence
└── requirements.txt  # Python dependencies
```

---

## ⚙️ Getting Started

### Prerequisites
* Python 3.10+
* Node.js & npm
* Weaviate Instance (Local or Cloud)
* API Keys: Groq, Supabase, and Clerk

### Backend Setup
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Configure your `.env` file with necessary API keys.
3. Start the API:
   ```bash
   python app/main.py
   ```
   *The API will be available at `http://localhost:8000` with Swagger docs at `/docs`*.

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

---

## 📄 License
This project is developed as part of an AI development initiative focused on health insurance transparency.
