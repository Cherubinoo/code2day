import os
import PyPDF2
from docx import Document

class DocumentLoader:
    @staticmethod
    def extract_text(file_path):
        """
        Extracts raw text from a PDF, DOCX, or TXT file.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
            
        if os.path.getsize(file_path) == 0:
            return ""
            
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext == ".pdf":
            return DocumentLoader._extract_pdf(file_path)
        elif ext == ".docx":
            return DocumentLoader._extract_docx(file_path)
        elif ext in [".txt", ".md"]:
            return DocumentLoader._extract_txt(file_path)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")

    @staticmethod
    def _extract_pdf(file_path):
        text = []
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text.append(page_text)
        return "\n".join(text)

    @staticmethod
    def _extract_docx(file_path):
        doc = Document(file_path)
        return "\n".join([p.text for p in doc.paragraphs])

    @staticmethod
    def _extract_txt(file_path):
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    @staticmethod
    def chunk_text(text, chunk_size=500, overlap=100):
        """
        Chunks text into segments of chunk_size with overlap characters.
        """
        if not text:
            return []
            
        chunks = []
        start = 0
        text_len = len(text)
        
        while start < text_len:
            end = start + chunk_size
            chunk = text[start:end]
            
            # Try to expand to the end of a word or sentence so we don't cut in the middle
            if end < text_len:
                # Find the nearest space within the next 30 characters
                next_space = text.find(" ", end, min(end + 30, text_len))
                if next_space != -1:
                    end = next_space
                    chunk = text[start:end]
                    
            chunks.append(chunk.strip())
            start = end - overlap
            
            # Infinite loop safety guard
            if chunk_size <= overlap:
                break
                
        # Filter empty chunks
        return [c for c in chunks if c]
