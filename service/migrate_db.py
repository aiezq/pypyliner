import sqlite3
import os

db_path = "/Users/aiezq/python_pr/operator_helper/service/operator_helper.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    # Check if column exists first
    cur.execute("PRAGMA table_info(manual_terminals_history)")
    columns = [row[1] for row in cur.fetchall()]
    if "is_sequence" not in columns:
        print("Adding is_sequence column...")
        cur.execute("ALTER TABLE manual_terminals_history ADD COLUMN is_sequence BOOLEAN DEFAULT 0")
        conn.commit()
    else:
        print("is_sequence column already exists.")
    conn.close()
else:
    print("DB file not found, will be created naturally on boot.")
