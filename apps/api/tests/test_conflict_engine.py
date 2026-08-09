"""Direct unit tests for the agenda conflict engine (§19.7).

These pin down the hard-vs-soft severity contract that session_service.schedule()
relies on to decide what allow_soft is and isn't allowed to override.
"""

from datetime import UTC, datetime

from app.rules.engine import detect_conflicts


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, 10, hour, minute, tzinfo=UTC)


def _session(id_, *, room=None, track=None, start, end, people=(), serial=False):
    return {
        "id": id_,
        "room_id": room,
        "track_id": track,
        "starts_at": start,
        "ends_at": end,
        "participant_person_ids": list(people),
        "track_serial": serial,
    }


def test_room_collision_is_hard():
    sessions = [
        _session("s1", room="room-a", start=_dt(10), end=_dt(11), people=["p1"]),
        _session("s2", room="room-a", start=_dt(10, 30), end=_dt(11, 30), people=["p2"]),
    ]
    conflicts = detect_conflicts(sessions)
    room_conflicts = [c for c in conflicts if c["kind"] == "room_collision"]
    assert room_conflicts and room_conflicts[0]["severity"] == "hard"


def test_speaker_collision_is_hard():
    sessions = [
        _session("s1", room="room-a", start=_dt(10), end=_dt(11), people=["p1"]),
        _session("s2", room="room-b", start=_dt(10, 30), end=_dt(11, 30), people=["p1"]),
    ]
    conflicts = detect_conflicts(sessions)
    speaker_conflicts = [c for c in conflicts if c["kind"] == "speaker_collision"]
    assert speaker_conflicts and speaker_conflicts[0]["severity"] == "hard"
    assert speaker_conflicts[0]["persons"] == ["p1"]


def test_serial_track_collision_is_soft_not_hard():
    sessions = [
        _session("s1", room="room-a", track="track-1", start=_dt(10), end=_dt(11), people=["p1"], serial=True),
        _session("s2", room="room-b", track="track-1", start=_dt(10, 30), end=_dt(11, 30), people=["p2"], serial=True),
    ]
    conflicts = detect_conflicts(sessions)
    track_conflicts = [c for c in conflicts if c["kind"] == "track_collision"]
    assert track_conflicts and track_conflicts[0]["severity"] == "soft"
    assert not [c for c in conflicts if c["severity"] == "hard"]


def test_non_serial_track_overlap_is_not_a_conflict():
    sessions = [
        _session("s1", room="room-a", track="track-1", start=_dt(10), end=_dt(11), people=["p1"], serial=False),
        _session("s2", room="room-b", track="track-1", start=_dt(10, 30), end=_dt(11, 30), people=["p2"], serial=False),
    ]
    assert detect_conflicts(sessions) == []


def test_event_boundary_and_invalid_duration_are_hard():
    sessions = [
        _session("s1", room="room-a", start=_dt(8), end=_dt(9), people=[]),  # starts before event start
        _session("s2", room="room-b", start=_dt(12), end=_dt(11), people=[]),  # ends before it starts
    ]
    conflicts = detect_conflicts(sessions, event_start=_dt(9), event_end=_dt(18))
    kinds = {c["kind"] for c in conflicts}
    assert "event_boundary" in kinds
    assert "invalid_duration" in kinds
    assert next(c for c in conflicts if c["kind"] == "event_boundary")["severity"] == "hard"
    assert next(c for c in conflicts if c["kind"] == "invalid_duration")["severity"] == "hard"
