import sqlite3
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os

import logging
import sys
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

basedir = os.path.abspath(os.path.dirname(__file__))
template_dir = os.path.join(basedir, 'templates')
static_dir = os.path.join(basedir, 'static')

logger.info(f"Current working directory: {os.getcwd()}")
logger.info(f"Base directory: {basedir}")
logger.info(f"Template directory: {template_dir}")
logger.info(f"Static directory: {static_dir}")

if os.path.exists(template_dir):
    logger.info(f"Template directory contents: {os.listdir(template_dir)}")
else:
    logger.error("Template directory does NOT exist!")

app = Flask(__name__, 
            static_folder=static_dir, 
            template_folder=template_dir)
CORS(app)

from jinja2 import TemplateNotFound

@app.route('/')
def index():
    try:
        return render_template('index.html')
    except TemplateNotFound:
        return f"""
        <h1>Error: Template Not Found</h1>
        <p>The server cannot find <code>index.html</code>.</p>
        <p><b>Current Template Directory:</b> {template_dir}</p>
        <p><b>Directory Contents:</b> {os.listdir(template_dir) if os.path.exists(template_dir) else 'Directory does not exist'}</p>
        <p>Please ensure you have uploaded the <code>templates</code> folder to GitHub.</p>
        """, 500

DB_NAME = os.path.join(basedir, "scheduler.db")

def init_db():
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        # Users Table
        c.execute('''CREATE TABLE IF NOT EXISTS users
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                      username TEXT UNIQUE NOT NULL, 
                      password TEXT NOT NULL)''')

        # Projects Table (New)
        c.execute('''CREATE TABLE IF NOT EXISTS projects
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      name TEXT NOT NULL,
                      color TEXT,
                      user_id INTEGER,
                      FOREIGN KEY(user_id) REFERENCES users(id))''')

        # Settings Table (New)
        c.execute('''CREATE TABLE IF NOT EXISTS settings
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      user_id INTEGER UNIQUE,
                      theme TEXT DEFAULT 'light',
                      working_hours_start TEXT DEFAULT '09:00',
                      working_hours_end TEXT DEFAULT '17:00',
                      FOREIGN KEY(user_id) REFERENCES users(id))''')

        # Tasks Table (Updated)
        c.execute('''CREATE TABLE IF NOT EXISTS tasks
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                      title TEXT NOT NULL, 
                      description TEXT, 
                      due_date TEXT, 
                      priority TEXT, 
                      status TEXT, 
                      user_id INTEGER,
                      project_id INTEGER,
                      parent_id INTEGER,
                      is_recurring BOOLEAN DEFAULT 0,
                      recurrence_rule TEXT,
                      completed_at TEXT,
                      reminder_time TEXT,
                      FOREIGN KEY(user_id) REFERENCES users(id),
                      FOREIGN KEY(project_id) REFERENCES projects(id))''')
        
        # Migration: Add new columns to existing tasks table if they don't exist
        # SQLite doesn't support IF NOT EXISTS for columns, so we try/except
        migrations = [
            "ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id)",
            "ALTER TABLE tasks ADD COLUMN parent_id INTEGER",
            "ALTER TABLE tasks ADD COLUMN is_recurring BOOLEAN DEFAULT 0",
            "ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT",
            "ALTER TABLE tasks ADD COLUMN completed_at TEXT",
            "ALTER TABLE tasks ADD COLUMN reminder_time TEXT"
        ]
        
        for migration in migrations:
            try:
                c.execute(migration)
                logger.info(f"Applied migration: {migration}")
            except sqlite3.OperationalError:
                # Column likely already exists
                pass

        conn.commit()
        conn.close()
        logger.info("Database initialized successfully with V2 schema.")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")

# Initialize DB immediately so it works with Gunicorn
init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    # Email Validation
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, username):
        return jsonify({'error': 'Username must be a valid email address'}), 400

    # Password Validation
    # At least 8 chars, 1 uppercase, 1 number, 1 special char
    password_regex = r'^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$'
    if not re.match(password_regex, password):
        return jsonify({'error': 'Password must be at least 8 characters long, contain one uppercase letter, one number, and one special character'}), 400
        
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, password))
        conn.commit()
        user_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        return jsonify({'id': user_id, 'username': username}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 409
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, password)).fetchone()
    conn.close()
    
    if user:
        return jsonify({'id': user['id'], 'username': user['username']}), 200
    else:
        return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/projects', methods=['GET'])
def get_projects():
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400
    
    conn = get_db_connection()
    projects = conn.execute('SELECT * FROM projects WHERE user_id = ?', (user_id,)).fetchall()
    conn.close()
    
    return jsonify([dict(p) for p in projects]), 200

@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.json
    conn = get_db_connection()
    cursor = conn.execute('INSERT INTO projects (name, color, user_id) VALUES (?, ?, ?)',
                          (data['name'], data['color'], data['userId']))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': new_id, **data}), 201

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400
        
    conn = get_db_connection()
    tasks = conn.execute('SELECT * FROM tasks WHERE user_id = ?', (user_id,)).fetchall()
    conn.close()
    
    tasks_list = [dict(task) for task in tasks]
    mapped_tasks = []
    for t in tasks_list:
        mapped_tasks.append({
            'id': t['id'],
            'title': t['title'],
            'description': t['description'],
            'dueDate': t['due_date'],
            'priority': t['priority'],
            'status': t['status'],
            'userId': t['user_id'],
            'projectId': t['project_id']
        })
        
    return jsonify(mapped_tasks), 200

@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.json
    conn = get_db_connection()
    cursor = conn.execute(
        'INSERT INTO tasks (title, description, due_date, priority, status, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (data['title'], data['description'], data['dueDate'], data['priority'], data['status'], data['userId'], data.get('projectId'))
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    
    return jsonify({'id': new_id, **data}), 201

@app.route('/api/tasks/<int:id>', methods=['PUT'])
def update_task(id):
    data = request.json
    conn = get_db_connection()
    conn.execute(
        'UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, project_id = ? WHERE id = ?',
        (data['title'], data['description'], data['dueDate'], data['priority'], data['status'], data.get('projectId'), id)
    )
    conn.commit()
    conn.close()
    return jsonify(data), 200

@app.route('/api/tasks/<int:id>', methods=['DELETE'])
def delete_task(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM tasks WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Deleted'}), 200

if __name__ == '__main__':
    init_db()
    print("Database initialized. Server running on port 5000...")
    app.run(debug=True, port=5000)
