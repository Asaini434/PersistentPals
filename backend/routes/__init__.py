from .admin import router as admin_router
from .auth import router as auth_router
from .chat import router as chat_router
from .health import router as health_router
from .patients import router as patients_router
from .providers import router as providers_router
from .rtm import router as rtm_router

__all__ = ["admin_router", "auth_router", "chat_router", "health_router", "patients_router", "providers_router", "rtm_router"]