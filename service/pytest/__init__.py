from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _find_real_pytest_init() -> Path:
    service_dir = Path(__file__).resolve().parents[1]
    candidates = sorted((service_dir / ".venv" / "lib").glob("python*/site-packages/pytest/__init__.py"))
    candidates.append(service_dir / ".venv" / "Lib" / "site-packages" / "pytest" / "__init__.py")
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise ModuleNotFoundError("No module named 'pytest'")


real_pytest_init = _find_real_pytest_init()
real_site_packages = str(real_pytest_init.parent.parent)
if real_site_packages not in sys.path:
    sys.path.insert(0, real_site_packages)
spec = importlib.util.spec_from_file_location(
    __name__,
    real_pytest_init,
    submodule_search_locations=[str(real_pytest_init.parent)],
)
if spec is None or spec.loader is None:
    raise ModuleNotFoundError("No module named 'pytest'")

module = importlib.util.module_from_spec(spec)
sys.modules[__name__] = module
spec.loader.exec_module(module)
