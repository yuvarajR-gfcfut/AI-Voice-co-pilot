"""
RAG retrieval agent. Loads data/kb.md, chunks it, embeds into Chroma,
and exposes retrieve(query) -> most relevant KB fact.

This is what makes the "Accuracy" guardrail real: the Next-Best-Action agent
must ONLY use facts that came out of this function, never its own memory.
"""

from pathlib import Path

KB_PATH = Path(__file__).resolve().parent.parent / "data" / "kb.md"

_collection = None  # Chroma collection, set up in build_index()


def load_kb_chunks() -> list[str]:
    """Split kb.md into bullet-point chunks."""
    text = KB_PATH.read_text(encoding="utf-8")
    chunks = [line.strip("-* \n") for line in text.splitlines() if line.strip().startswith(("-", "*"))]
    return [c for c in chunks if c]


import chromadb

def build_index():
    """Build the index by chunking kb.md and adding it to an ephemeral Chroma collection."""
    global _collection
    client = chromadb.Client()
    # EphemeralClient is also Client() by default. Let's create collection.
    try:
        collection = client.get_collection("knowledge_base")
    except Exception:
        collection = client.create_collection("knowledge_base")
        
    chunks = load_kb_chunks()
    collection.add(
        documents=chunks,
        ids=[str(i) for i in range(len(chunks))]
    )
    _collection = collection


def retrieve(query: str, top_k: int = 1) -> str:
    """Query ChromaDB and return the most relevant KB fact(s) as a single string."""
    global _collection
    if _collection is None:
        build_index()
    
    results = _collection.query(query_texts=[query], n_results=top_k)
    if results and "documents" in results and results["documents"]:
        return " ".join(results["documents"][0])
    return ""
