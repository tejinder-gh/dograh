"""Azure authentication and transport with Acuity's OpenAI realtime behavior."""

from api.services.pipecat.realtime.openai_realtime import AcuityOpenAIRealtimeLLMService
from pipecat.services.azure.realtime.llm import AzureRealtimeLLMService


class AcuityAzureRealtimeLLMService(
    AcuityOpenAIRealtimeLLMService, AzureRealtimeLLMService
):
    """Share OpenAI conversation handling while retaining Azure's constructor."""
