"""Embedding services for document processing and retrieval."""

from .acuity_service import AcuityEmbeddingService
from .azure_openai_service import (
    AzureEmbeddingAPIKeyNotConfiguredError,
    AzureOpenAIEmbeddingService,
)
from .base import BaseEmbeddingService
from .factory import build_embedding_service, resolve_embedding_correlation_id
from .openai_service import EmbeddingAPIKeyNotConfiguredError, OpenAIEmbeddingService

__all__ = [
    "AzureEmbeddingAPIKeyNotConfiguredError",
    "AzureOpenAIEmbeddingService",
    "BaseEmbeddingService",
    "AcuityEmbeddingService",
    "EmbeddingAPIKeyNotConfiguredError",
    "OpenAIEmbeddingService",
    "build_embedding_service",
    "resolve_embedding_correlation_id",
]
