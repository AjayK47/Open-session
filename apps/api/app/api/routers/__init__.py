from fastapi import APIRouter

from .api_keys import router as api_keys_router
from .auth import router as auth_router
from .calendar import router as calendar_router
from .communications import router as communications_router
from .dashboard import router as dashboard_router
from .evaluations import router as evaluations_router
from .events import router as events_router
from .file_requests import router as file_requests_router
from .files import router as files_router
from .forms import router as forms_router
from .me import router as me_router
from .portal_forms import router as portal_forms_router
from .program import router as program_router
from .public import router as public_router
from .reminders import router as reminders_router
from .resources import router as resources_router
from .saved_views import router as saved_views_router
from .sessions import router as sessions_router
from .speakers import router as speakers_router
from .submissions import router as submissions_router
from .tasks import router as tasks_router
from .team import router as team_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(calendar_router)
api_router.include_router(events_router)
api_router.include_router(program_router)
api_router.include_router(portal_forms_router)
api_router.include_router(forms_router)
api_router.include_router(submissions_router)
api_router.include_router(public_router)
api_router.include_router(evaluations_router)
api_router.include_router(sessions_router)
api_router.include_router(speakers_router)
api_router.include_router(me_router)
api_router.include_router(tasks_router)
api_router.include_router(files_router)
api_router.include_router(file_requests_router)
api_router.include_router(communications_router)
api_router.include_router(dashboard_router)
api_router.include_router(saved_views_router)
api_router.include_router(team_router)
api_router.include_router(api_keys_router)
api_router.include_router(reminders_router)
api_router.include_router(resources_router)

__all__ = ["api_router"]
