from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_together import Together
from langchain_core.output_parsers import JsonOutputParser
from typing import Dict

llm = Together(model="meta-llama/Llama-3-8b-chat-hf")

audit_prompt = ChatPromptTemplate.from_messages("""
Grade this generated response for factual accuracy against retrieved documents.
Response: {response}
Retrieved chunks: {chunks}
Score 0-100 on: faithfulness (no hallucinations), completeness (covers query), compliance (matches insurance rules).
Output JSON: {{'score': int, 'faithfulness': str, 'completeness': str, 'compliance': str, 'flags': list[str]}}                                      
""")

audit_chain = audit_prompt | llm | JsonOutputParser()

def audit_response(response: str, chunks: str) -> Dict:
    try: 
        return audit_chain.invoke({"response": response, "chunks": chunks})
    except Exception as e:
        return {"score": 0, "error": str(e)}
    
# Example usage:
audit_result = audit_response(response.response, str(response.source_nodes))
if audit_result.get("score", 0) < 85:
    # re generate or flag 
    response += f"\nAudit Warning: Low score ({audit_result['score']}). Flags: {audit_result['flags']}"
    