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
    text = KB_PATH.read_text()
    chunks = [line.strip("-* \n") for line in text.splitlines() if line.strip().startswith(("-", "*"))]
    return [c for c in chunks if c]


def build_index():
    """
    TODO: embed each chunk and store in Chroma. e.g.:

        import chromadb
        client = chromadb.Client()
        collection = client.create_collection("kb")
        chunks = load_kb_chunks()
        collection.add(documents=chunks, ids=[str(i) for i in range(len(chunks))])
        global _collection
        _collection = collection
    """
    raise NotImplementedError("Build the Chroma index here.")


def retrieve(query: str, top_k: int = 1) -> str:
    """
    TODO: query the Chroma collection and return the top fact(s) as a single string.

        results = _collection.query(query_texts=[query], n_results=top_k)
        return " ".join(results["documents"][0])
    """
    raise NotImplementedError("Wire up the Chroma query here.")
