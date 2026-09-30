import importlib
import inspect
import pkgutil

import rules
from rules.base import Rule


def load_rules():
    """Find every rule in the rules/ package and return one instance of each.

    Runs on every call, so dropping a new file into rules/ is picked up
    without restarting or editing this file.
    """
    importlib.invalidate_caches()  # let Python see files added since startup
    instances = []
    for info in pkgutil.iter_modules(rules.__path__):
        if info.name == "base":
            continue  # base.py only holds the Rule base class
        module = importlib.import_module(f"rules.{info.name}")
        module = importlib.reload(module)  # pick up edits to existing rule files
        for _, cls in inspect.getmembers(module, inspect.isclass):
            # only classes defined in this module (skips the imported Rule itself)
            if issubclass(cls, Rule) and cls is not Rule and cls.__module__ == module.__name__:
                instances.append(cls())
    return instances


def score(txn, history):
    """Run every rule, add up the scores, and collect the reasons.

    Returns (total_score, reasons_list).
    """
    total = 0
    reasons = []
    for rule in load_rules():
        points, reason = rule.evaluate(txn, history)
        if points > 0:
            total += points
            if reason:
                reasons.append(reason)
    return total, reasons
