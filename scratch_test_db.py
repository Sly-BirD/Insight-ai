import asyncio
from dotenv import load_dotenv
load_dotenv()
from app import database as db

async def test_db():
    print("Testing save_query...")
    success = db.save_query(
        user_id="test_user_123",
        question="Test question",
        decision="approve",
        confidence=95,
        audit_score=90,
        duration_s=1.5,
        justification="Test justification",
        summary="Test summary",
        clauses_count=2
    )
    print(f"Save query success: {success}")

    print("Fetching queries...")
    queries = db.get_user_queries("test_user_123")
    print(f"Found {len(queries)} queries")
    if queries:
        print("First query:", queries[0])

if __name__ == "__main__":
    asyncio.run(test_db())
