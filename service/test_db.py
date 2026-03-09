import os
from pathlib import Path

# Adjust path and import as needed
import sys
sys.path.append(os.path.abspath("/Users/aiezq/python_pr/operator_helper/service"))

from src.app.services.history_db import HistoryDatabase

db = HistoryDatabase()
db.ensure_ready()
try:
    history = db.fetch_history()
    print("Success. Total runs:", len(history["runs"]))
except Exception as e:
    import traceback
    traceback.print_exc()
