"""The Power of 10, checked on the package itself.

R1 (simple control flow), R4 (60 lines per function) and R6 (smallest scope)
are the three a tool can prove on the Python side. The browser code is held
to the same three by ESLint (see ``eslint.config.js``); the rest is review.
"""

import ast
from pathlib import Path

import pytest

SOURCE_ROOT = Path(__file__).resolve().parent.parent / "django_camera_kit"

#: R4 — a function must fit on one printed page.
MAX_FUNCTION_LINES = 60

#: Migrations are generated code: Django writes them, we do not.
SOURCE_FILES = sorted(path for path in SOURCE_ROOT.rglob("*.py") if "migrations" not in path.parts)


def _functions(tree):
    return [
        node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]


@pytest.fixture(scope="module")
def trees():
    return {path: ast.parse(path.read_text(encoding="utf-8")) for path in SOURCE_FILES}


def test_the_package_has_source_files():
    assert SOURCE_FILES


def test_no_function_is_longer_than_a_page(trees):
    too_long = [
        f"{path.name}:{node.lineno} {node.name} ({node.end_lineno - node.lineno + 1} lines)"
        for path, tree in trees.items()
        for node in _functions(tree)
        if node.end_lineno - node.lineno + 1 > MAX_FUNCTION_LINES
    ]
    assert not too_long, f"R4 — functions over {MAX_FUNCTION_LINES} lines: {too_long}"


def test_no_direct_recursion(trees):
    recursive = []
    for path, tree in trees.items():
        for node in _functions(tree):
            calls = [call.func for call in ast.walk(node) if isinstance(call, ast.Call)]
            names = {call.id for call in calls if isinstance(call, ast.Name)}
            if node.name in names:
                recursive.append(f"{path.name}:{node.lineno} {node.name}")
    assert not recursive, f"R1 — recursive functions: {recursive}"


def test_no_module_level_mutable_state(trees):
    globals_used = [
        f"{path.name}:{node.lineno}"
        for path, tree in trees.items()
        for node in ast.walk(tree)
        if isinstance(node, ast.Global)
    ]
    assert not globals_used, f"R6 — `global` statements: {globals_used}"


def test_no_silent_exception_handler(trees):
    silent = []
    for path, tree in trees.items():
        for node in ast.walk(tree):
            if not isinstance(node, ast.ExceptHandler):
                continue
            if node.type is None or all(isinstance(child, ast.Pass) for child in node.body):
                silent.append(f"{path.name}:{node.lineno}")
    assert not silent, f"R1 — bare or silent exception handlers: {silent}"


def test_no_eval_or_exec(trees):
    dangerous = [
        f"{path.name}:{node.lineno} {node.func.id}"
        for path, tree in trees.items()
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in ("eval", "exec")
    ]
    assert not dangerous, f"R1 — eval/exec: {dangerous}"


def test_the_browser_code_holds_no_user_facing_text():
    """R-Part 4 — translatable strings live in the widget, not in the JS."""
    scripts = sorted(SOURCE_ROOT.rglob("*.js"))
    scripts = [path for path in scripts if "vendor" not in path.parts]
    assert scripts

    accented = []
    for path in scripts:
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if any(letter in line for letter in "éèêàçùôîœ"):
                accented.append(f"{path.name}:{number}")
    assert not accented, f"French text left in the browser code: {accented}"
