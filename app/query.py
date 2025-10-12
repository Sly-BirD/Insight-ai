from llama_index.core import load_index_from_storage, QueryBundle, get_response_synthesizer
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.postprocessor import SimilarityPostprocessor
from llama_index.llms.together import TogetherLLM 
from llama_index.core import Settings, StorageContext
from app.ingest import embed_model, client

Settings.embed_model = embed_model
llm = TogetherLLM(model= "meta-llama/Llama-3-8b-chat-hf", api_key = os.getenc("TOGETHER_API_KEY"))

def load_index():
    vector_store = WeaviateVectorStore(weaviate_client= client, index_name= "InsuranceIndex")
    storage_context = StorageContext.from_defaults(vector_store= vector_store, persist_dor = "storage")
    return load_index_from_storage(storage_context)

def query_docs(query: str):
    index = load_index()
    retriever = VectorIndexRetriever(index= index, similarity_top_k= 5)
    postprocessor = SimilarityPostprocessor(similarity_cutoff= 0.75)
    synthesizer = get_response_synthesizer(llm=llm, response_mode= "compact")
    query_engine = index.as_query_engine(retriever- retriever, node_postprocessors=[postprocessor], response_synthesizer= synthesizer)
    response = query_engine.query(query)
    # custom prompt for structured response 
    structured_prompt = f"Based on retrieved clauses, output JSON: {{'decision': 'approve/reject', 'justification': 'explain', 'clauses': ['refs']}} for query: {query}"
    final_response = llm.complete(structured_prompt + str(response))
    return final_response 

if __name__ == "__main__":
    print(query_docs("Does this policy cover pre-existing diabetes for surgery?"))



