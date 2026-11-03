"""Condiciones declarativas acotadas; un documento desconocido no se ejecuta."""

import operator

COMPARATORS = {
    "eq": operator.eq,
    "gte": operator.ge,
    "lte": operator.le,
    "gt": operator.gt,
    "lt": operator.lt,
}
MAX_DEPTH = 12
COUNT_NAMES = {"recommended", "acceptable", "risky", "contraindicated", "critical"}


def evaluate(condition, context, depth=0):
    if depth > MAX_DEPTH or not isinstance(condition, dict) or not condition:
        return False
    if set(condition) == {"all"} or set(condition) == {"any"}:
        key = next(iter(condition))
        items = condition[key]
        if not isinstance(items, list) or not items or len(items) > 100:
            return False
        values = [evaluate(item, context, depth + 1) for item in items]
        return all(values) if key == "all" else any(values)
    if set(condition) == {"not"}:
        # Un documento inválido no se vuelve verdadero por negación.
        return is_valid(condition["not"], depth + 1) and not evaluate(
            condition["not"], context, depth + 1
        )
    if set(condition) == {"flag"}:
        key = condition["flag"]
        return isinstance(key, str) and key in context.get("milestones", [])
    if "count" in condition:
        name = condition["count"]
        comparators = set(condition) - {"count"}
        if (
            not isinstance(name, str)
            or name not in COUNT_NAMES
            or len(comparators) != 1
        ):
            return False
        comparator = next(iter(comparators))
        value = condition[comparator]
        if comparator not in COMPARATORS or type(value) is not int:
            return False
        return COMPARATORS[comparator](context.get("counts", {}).get(name, 0), value)
    return False


def is_valid(condition, depth=0):
    if depth > MAX_DEPTH or not isinstance(condition, dict) or not condition:
        return False
    if set(condition) in ({"all"}, {"any"}):
        items = next(iter(condition.values()))
        return (
            isinstance(items, list)
            and 0 < len(items) <= 100
            and all(is_valid(item, depth + 1) for item in items)
        )
    if set(condition) == {"not"}:
        return is_valid(condition["not"], depth + 1)
    if set(condition) == {"flag"}:
        return isinstance(condition["flag"], str) and bool(condition["flag"])
    names = set(condition) - {"count"}
    if (
        "count" in condition
        and isinstance(condition["count"], str)
        and condition["count"] in COUNT_NAMES
        and len(names) == 1
    ):
        key = next(iter(names))
        return key in COMPARATORS and type(condition[key]) is int
    return False
