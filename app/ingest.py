import os 
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StoragContext
from llama_index.embeddings.huggingface import HuggingFaceEmbeddings
from llama_index.vector_stores.weaviate import WeaviateVectorStore
import weaviate 
from dotenv import load_dotenv

load_dotenv()
client= weaviate.Client("http://localhost:8080")
emded_model = HuggingFaceEmbeddings(model_name = "BAAI/bge-base-en-v1.5")     # top 2025 pick

def ingest_docs(directory: str = "data"):
    reader = SimpleDirectoryReader(input_dir= directory, required_exts= {".pdf", ".docx", ".txt"})
    documents = reader.load_data()   # Auto-parses with unstructured
    vector_store = WeaviateVectorStore(weaviate_client= client, index_name= "InsuranceIndex")
    storage_context = StorageContext.from_defaults(vector_store= vector_store)
    index= VectorStoreIndex.from_documents(documents, storage_context= storage_context, embed_model= embed_model)
    index.storage_context.persist(persist_dir = "Storage")    # Persist(save) to disk
    print(f"ingested {len(documents)} docs.")
    return index

if __name__ == "__main__":
    ingest_docs
