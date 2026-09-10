import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer

class HashingEmbeddings:
    """
    Offline text embedding generator utilizing scikit-learn's HashingVectorizer.
    Generates 384-dimensional dense, L2-normalized float vectors.
    """
    def __init__(self, n_features=384):
        self.n_features = n_features
        self.vectorizer = HashingVectorizer(
            n_features=n_features,
            alternate_sign=False,
            stop_words='english'
        )

    def embed_documents(self, texts):
        """
        Embeds a list of documents/chunks. Returns a list of lists of floats.
        """
        if not texts:
            return []
        # Get sparse matrix
        sparse_vectors = self.vectorizer.transform(texts).toarray()
        
        # Apply L2 normalization manually
        norms = np.linalg.norm(sparse_vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0  # Prevent division by zero
        normalized_vectors = sparse_vectors / norms
        
        return normalized_vectors.tolist()

    def embed_query(self, text):
        """
        Embeds a single query string. Returns a list of floats.
        """
        if not text:
            return [0.0] * self.n_features
        # Transform single query
        vector = self.vectorizer.transform([text]).toarray()[0]
        
        # L2 normalize
        norm = np.linalg.norm(vector)
        if norm > 0:
            vector = vector / norm
            
        return vector.tolist()
