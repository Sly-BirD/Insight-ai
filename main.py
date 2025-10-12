from fastapi import FastAPI, UploadFile, File, HTTPException 
from fastapi.responses import JSONResponse 
from app.query import ingest_docs 
from app.ingest import query_docs 
import shutil 
import os 

app=FastAPI()
@app.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    try:
        temp_path= f"temp/{file.filename}"
        os.makedors('temp', exist_ok=True)
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            ingest_docs("temp")  # ingest single or batch of files
            return {"status": "ingested"}
    except Exception as e:
        raise HTTPException(status_code= 500, detail =str(e))
    
    app.get("/query")
    async def query(q: str):
        try:
            return JSONResponse(content= {"response": query_docs(q)})
        
        except Exception as e:
            raise HTTPException(status_code= 500, detail =str(e))
        
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host= "0.0.0.0", port= 8000)
