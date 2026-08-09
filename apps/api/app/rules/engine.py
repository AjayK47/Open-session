"""Evaluation of conditional field rules and category routing rules (§8.2 step 5).

Conditional rules change which fields are shown and required based on answers.
Routing rules assign track/tags/owner/evaluation-plan when a condition matches.
"""

from typing import Any, Literal

Operator = Literal["equals", "not_equals", "contains", "any_of", "is_set", "is_not_set"]
RuleActionKind = Literal["show", "hide", "require"]
RoutingActionKind = Literal["assign_track", "add_tag", "assign_evaluation_plan", "assign_owner"]

type ConditionalRule = dict[str, Any]
type RoutingRule = dict[str, Any]

CONDITIONAL_OPERATORS: set[Operator] = {"equals", "not_equals", "contains", "any_of", "is_set", "is_not_set"}
RULE_ACTIONS: set[RuleActionKind] = {"show", "hide", "require"}
ROUTING_ACTION_KINDS: set[RoutingActionKind] = {
    "assign_track",
    "add_tag",
    "assign_evaluation_plan",
    "assign_owner",
}

type Answers = dict[str, Any]
type RoutingEffects = dict[str, Any]


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}
    # note: 0 and False are NOT empty


def evaluate_condition(field: str, operator: str, value: Any, answers: Answers) -> bool:
    answer = answers.get(field)

    if operator == "is_set":
        return not _is_empty(answer)
    if operator == "is_not_set":
        return _is_empty(answer)

    if operator == "equals":
        return answer == value
    if operator == "not_equals":
        return answer != value
    if operator == "contains":
        if isinstance(answer, list):
            return value in answer
        return value in str(answer or "")
    if operator == "any_of":
        wanted = value if isinstance(value, list) else [value]
        have = answer if isinstance(answer, list) else [answer]
        return bool(set(wanted) & set(have))
    return False


def evaluate_conditional_rules(answers: Answers, rules: list[ConditionalRule]) -> dict[str, bool]:
    """Return {field_key: is_visible} for fields affected by show/hide rules.

    Default is: every field visible. `hide` marks a field hidden; a later `show`
    for the same field makes it visible again (last action wins per field).
    """
    visibility: dict[str, bool] = {}
    for rule in rules:
        if not evaluate_condition(rule["field"], rule["operator"], rule.get("value"), answers):
            continue
        for action in rule.get("actions", []):
            kind, target = action.get("kind"), action.get("target")
            if kind not in RULE_ACTIONS or not target:
                continue
            if kind == "show":
                visibility[target] = True
            elif kind == "hide":
                visibility[target] = False
    return visibility


def required_fields(answers: Answers, rules: list[ConditionalRule]) -> set[str]:
    """Return fields force-required by matching `require` actions."""
    required: set[str] = set()
    for rule in rules:
        if not evaluate_condition(rule["field"], rule["operator"], rule.get("value"), answers):
            continue
        for action in rule.get("actions", []):
            if action.get("kind") == "require" and action.get("target"):
                required.add(action["target"])
    return required


def visible_field_keys(sections: list[dict], visibility: dict[str, bool]) -> set[str]:
    """All configured field keys minus those hidden by rule evaluation."""
    all_keys = {field["key"] for section in sections for field in section.get("fields", [])}
    hidden = {key for key, visible in visibility.items() if not visible}
    return all_keys - hidden


def apply_routing(answers: Answers, rules: list[RoutingRule]) -> RoutingEffects:
    """Apply the first matching routing rule.

    Returns effects with keys track_id / add_tag / assign_owner / assign_evaluation_plan.
    """
    effects: RoutingEffects = {"track_id": None, "tags": [], "owner_person_id": None, "evaluation_plan_id": None}
    for rule in rules:
        trigger = rule.get("trigger", {})
        if not evaluate_condition(trigger.get("field", ""), trigger.get("operator", ""), trigger.get("value"), answers):
            continue
        for action in rule.get("actions", []):
            kind: RoutingActionKind = action.get("kind")
            value = action.get("value")
            if kind == "assign_track":
                effects["track_id"] = value
            elif kind == "add_tag":
                effects["tags"].append(value)
            elif kind == "assign_owner":
                effects["owner_person_id"] = value
            elif kind == "assign_evaluation_plan":
                effects["evaluation_plan_id"] = value
        break
    return effects


# ---------------------------------------------------------------------------
# Agenda conflict engine (§19.7)
# ---------------------------------------------------------------------------

type Conflict = dict[str, Any]


def _overlap(a_start, a_end, b_start, b_end) -> bool:
    return a_start < b_end and b_start < a_end


def detect_conflicts(
    sessions: list[dict[str, Any]],
    *,
    event_start: Any = None,
    event_end: Any = None,
) -> list[Conflict]:
    """Detect room/speaker/track collisions, boundary violations, and invalid durations.

    Each session dict must include: id, starts_at, ends_at (datetime), room_id,
    track_id, participant_person_ids (list), track_serial (bool).
    """
    conflicts: list[Conflict] = []
    scheduled = [
        s
        for s in sessions
        if s.get("starts_at") is not None and s.get("ends_at") is not None and s.get("id") is not None
    ]

    for i in range(len(scheduled)):
        a = scheduled[i]
        if a["ends_at"] <= a["starts_at"]:
            conflicts.append(
                {
                    "kind": "invalid_duration",
                    "sessions": [a["id"]],
                    "severity": "hard",
                    "detail": "Session ends before or at its start time.",
                }
            )
        for b in scheduled[i + 1 :]:
            if not _overlap(a["starts_at"], a["ends_at"], b["starts_at"], b["ends_at"]):
                continue

            if a.get("room_id") and a["room_id"] == b.get("room_id"):
                conflicts.append(
                    {
                        "kind": "room_collision",
                        "sessions": [a["id"], b["id"]],
                        "severity": "hard",
                        "detail": "Two sessions overlap in the same room.",
                    }
                )

            shared = set(a.get("participant_person_ids") or []) & set(b.get("participant_person_ids") or [])
            if shared:
                conflicts.append(
                    {
                        "kind": "speaker_collision",
                        "sessions": [a["id"], b["id"]],
                        "persons": sorted(shared),
                        "severity": "hard",
                        "detail": "The same person appears in overlapping sessions.",
                    }
                )

            if (
                a.get("track_id")
                and a["track_id"] == b.get("track_id")
                and (a.get("track_serial") or b.get("track_serial"))
            ):
                conflicts.append(
                    {
                        "kind": "track_collision",
                        "sessions": [a["id"], b["id"]],
                        "severity": "soft",
                        "detail": "Overlapping sessions in a serial (single-track) category.",
                    }
                )

    for s in scheduled:
        if event_start is not None and s["starts_at"] < event_start:
            conflicts.append(
                {
                    "kind": "event_boundary",
                    "sessions": [s["id"]],
                    "severity": "hard",
                    "detail": "Session starts before the event start.",
                }
            )
        if event_end is not None and s["ends_at"] > event_end:
            conflicts.append(
                {
                    "kind": "event_boundary",
                    "sessions": [s["id"]],
                    "severity": "hard",
                    "detail": "Session ends after the event end.",
                }
            )

    return conflicts
