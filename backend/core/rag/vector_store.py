import numpy as np


def _get_models():
    from apps.knowledge_base_app.models import RAGDocument, RAGChunk
    return RAGDocument, RAGChunk


class PostgresVectorStore:
    """
    Vector Store that stores chunks and embeddings inside the Postgres database using Django models.
    """
    def add_document(self, filename, source_type, chunks_text, embeddings, file_hash="", metadata_list=None):
        """
        Registers a document and its chunks in the Postgres database.
        Overwrites any previous chunks for the same filename/source_type combo.
        """
        RAGDocument, RAGChunk = _get_models()
        # Delete old document records with the same name and source type to update/avoid duplicates
        RAGDocument.objects.filter(filename=filename, source_type=source_type).delete()

        # Create document
        doc = RAGDocument.objects.create(
            filename=filename,
            source_type=source_type,
            file_hash=file_hash
        )

        # Build chunk instances
        chunk_instances = []
        for idx, (text, emb) in enumerate(zip(chunks_text, embeddings)):
            meta = metadata_list[idx] if metadata_list and idx < len(metadata_list) else {}
            chunk_instances.append(
                RAGChunk(
                    document=doc,
                    text=text,
                    chunk_index=idx,
                    embedding=emb,
                    metadata=meta
                )
            )

        # Bulk create chunks for database efficiency
        RAGChunk.objects.bulk_create(chunk_instances)
        return doc

    def search(self, query_vector, source_type, k=3):
        """
        Performs Cosine Similarity search over all chunks matching the given source_type.
        """
        _, RAGChunk = _get_models()
        # Retrieve all chunks matching the target source type
        # We pre-fetch the document to access the filename
        chunks = RAGChunk.objects.filter(document__source_type=source_type).select_related("document")
        
        if not chunks:
            return []
            
        # Extract embeddings and texts
        chunk_embeddings = []
        chunk_list = []
        for chunk in chunks:
            # chunk.embedding is a JSON list of floats
            if chunk.embedding and len(chunk.embedding) == len(query_vector):
                chunk_embeddings.append(chunk.embedding)
                chunk_list.append(chunk)
                
        if not chunk_embeddings:
            return []
            
        # Convert to numpy arrays for fast dot product calculation
        query_arr = np.array(query_vector)
        embeddings_arr = np.array(chunk_embeddings)
        
        # Embeddings are L2 normalized, so cosine similarity is simply the dot product
        similarities = np.dot(embeddings_arr, query_arr)
        
        # Get top k indices
        top_k_indices = np.argsort(similarities)[::-1][:k]
        
        results = []
        for idx in top_k_indices:
            score = float(similarities[idx])
            chunk = chunk_list[idx]
            results.append({
                "text": chunk.text,
                "score": score,
                "chunk_index": chunk.chunk_index,
                "document": chunk.document.filename,
                "metadata": chunk.metadata
            })
            
        return results
