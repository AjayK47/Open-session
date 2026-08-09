"""Conditional logic, category routing, and conflict engine (§8.2 step 5, §19.7).

Phase 2 (CFP): evaluate conditional field rules + category routing rules.
Phase 7 (Agenda): conflict detection (room/speaker/track collisions, boundaries).

The rule model and evaluation engine live in `engine.py`.
"""

from app.rules.engine import (
    CONDITIONAL_OPERATORS,
    ROUTING_ACTION_KINDS,
    RULE_ACTIONS,
    Answers,
    ConditionalRule,
    Operator,
    RoutingActionKind,
    RoutingEffects,
    RoutingRule,
    apply_routing,
    detect_conflicts,
    evaluate_condition,
    evaluate_conditional_rules,
    required_fields,
    visible_field_keys,
)

__all__ = [
    "CONDITIONAL_OPERATORS",
    "ROUTING_ACTION_KINDS",
    "RULE_ACTIONS",
    "Answers",
    "ConditionalRule",
    "Operator",
    "RoutingActionKind",
    "RoutingEffects",
    "RoutingRule",
    "apply_routing",
    "detect_conflicts",
    "evaluate_condition",
    "evaluate_conditional_rules",
    "required_fields",
    "visible_field_keys",
]
