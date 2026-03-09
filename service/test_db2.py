import os
import sys
sys.path.append(os.path.abspath("/Users/aiezq/python_pr/operator_helper/service"))

from src.app.services.history_db import HistoryDatabase

db = HistoryDatabase()
history = db.fetch_history()
if history["manual_terminal_history"]:
    print(history["manual_terminal_history"][0])
else:
    print("No history found")
