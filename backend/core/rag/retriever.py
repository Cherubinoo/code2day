import os
import hashlib
from .document_loader import DocumentLoader
from .embeddings import HashingEmbeddings
from .vector_store import PostgresVectorStore

class RAGRetriever:
    """
    Retriever class that coordinates DocumentLoader, HashingEmbeddings, and PostgresVectorStore
    to offer a complete high-level RAG indexing and search interface.
    """
    def __init__(self):
        self.embeddings = HashingEmbeddings()
        self.vector_store = PostgresVectorStore()

    def index_file(self, file_path, source_type):
        """
        Loads a document, chunks it, embeds it, and registers it in Postgres.
        """
        filename = os.path.basename(file_path)
        
        # Calculate file hash to check uniqueness/integrity
        file_hash = ""
        try:
            hasher = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hasher.update(chunk)
            file_hash = hasher.hexdigest()
        except Exception:
            pass
            
        # Extract text and chunk it
        text = DocumentLoader.extract_text(file_path)
        chunks = DocumentLoader.chunk_text(text, chunk_size=500, overlap=100)
        
        if not chunks:
            return None
            
        # Generate embeddings
        embeddings = self.embeddings.embed_documents(chunks)
        
        # Create metadata entries
        metadata_list = [{"filename": filename, "source_type": source_type} for _ in chunks]
        
        # Add to vector store
        return self.vector_store.add_document(
            filename=filename,
            source_type=source_type,
            chunks_text=chunks,
            embeddings=embeddings,
            file_hash=file_hash,
            metadata_list=metadata_list
        )

    def index_text(self, title, text, source_type):
        """
        Chunks raw text, embeds it, and registers it in Postgres.
        """
        if not text:
            return None
            
        chunks = DocumentLoader.chunk_text(text, chunk_size=500, overlap=100)
        if not chunks:
            return None
            
        # Generate embeddings
        embeddings = self.embeddings.embed_documents(chunks)
        
        # Create metadata entries
        metadata_list = [{"title": title, "source_type": source_type} for _ in chunks]
        
        # Add to vector store
        return self.vector_store.add_document(
            filename=title,
            source_type=source_type,
            chunks_text=chunks,
            embeddings=embeddings,
            file_hash="",
            metadata_list=metadata_list
        )

    def retrieve_context(self, query, source_type, k=3):
        """
        Embeds query, searches database for top k results, and returns combined text context.
        """
        if not query:
            return ""
            
        query_vector = self.embeddings.embed_query(query)
        search_results = self.vector_store.search(query_vector, source_type, k=k)
        
        context_parts = []
        for res in search_results:
            context_parts.append(res["text"])
            
        return "\n\n".join(context_parts)
