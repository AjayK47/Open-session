from fastapi import HTTPException

from app.models.program import Room, SessionFormat, Tag, Track
from app.repositories import Repositories


class _ConfigService:
    kind = ""

    def list(self, repos: Repositories, event_id: str) -> list:
        raise NotImplementedError

    def create(self, repos: Repositories, event_id: str, payload):
        raise NotImplementedError

    def update(self, repos: Repositories, item_id: str, patch):
        raise NotImplementedError

    def _not_found(self):
        raise HTTPException(status_code=404, detail=f"{self.kind} not found")


class TrackService(_ConfigService):
    kind = "track"

    def list(self, repos: Repositories, event_id: str) -> list[Track]:
        return repos.tracks.list_by_event(event_id)

    def create(self, repos: Repositories, event_id: str, payload) -> Track:
        return repos.tracks.create(event_id, payload.model_dump())

    def update(self, repos: Repositories, item_id: str, patch) -> Track:
        item = repos.tracks.update(item_id, patch.model_dump(exclude_none=True))
        if item is None:
            self._not_found()
        return item


class RoomService(_ConfigService):
    kind = "room"

    def list(self, repos: Repositories, event_id: str) -> list[Room]:
        return repos.rooms.list_by_event(event_id)

    def create(self, repos: Repositories, event_id: str, payload) -> Room:
        return repos.rooms.create(event_id, payload.model_dump())

    def update(self, repos: Repositories, item_id: str, patch) -> Room:
        item = repos.rooms.update(item_id, patch.model_dump(exclude_none=True))
        if item is None:
            self._not_found()
        return item


class FormatService(_ConfigService):
    kind = "session format"

    def list(self, repos: Repositories, event_id: str) -> list[SessionFormat]:
        return repos.formats.list_by_event(event_id)

    def create(self, repos: Repositories, event_id: str, payload) -> SessionFormat:
        return repos.formats.create(event_id, payload.model_dump())

    def update(self, repos: Repositories, item_id: str, patch) -> SessionFormat:
        item = repos.formats.update(item_id, patch.model_dump(exclude_none=True))
        if item is None:
            self._not_found()
        return item


class TagService(_ConfigService):
    kind = "tag"

    def list(self, repos: Repositories, event_id: str) -> list[Tag]:
        return repos.tags.list_by_event(event_id)

    def create(self, repos: Repositories, event_id: str, payload) -> Tag:
        return repos.tags.create(event_id, payload.model_dump())

    def update(self, repos: Repositories, item_id: str, patch) -> Tag:
        item = repos.tags.update(item_id, patch.model_dump(exclude_none=True))
        if item is None:
            self._not_found()
        return item
