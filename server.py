import os
import logging
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import relationship

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

basedir = os.path.abspath(os.path.dirname(__file__))
template_dir = os.path.join(basedir, 'templates')
static_dir = os.path.join(basedir, 'static')

app = Flask(__name__, static_folder=static_dir, template_folder=template_dir)
CORS(app)

# Database Configuration
# Use DATABASE_URL if available (Render), otherwise local sqlite
database_url = os.environ.get('DATABASE_URL', 'sqlite:///' + os.path.join(basedir, 'scheduler.db'))
# Fix for Render's postgres:// vs SQLAlchemy's postgresql://
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Initialize DB (Create tables)
# --- Models ---

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    tasks = relationship('Task', backref='user', lazy=True)
    projects = relationship('Project', backref='user', lazy=True)
    settings = relationship('Settings', backref='user', uselist=False, lazy=True)

class Project(db.Model):
    __tablename__ = 'projects'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(20), default='#6366f1')
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    tasks = relationship('Task', backref='project', lazy=True)

class Settings(db.Model):
    __tablename__ = 'settings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    theme = db.Column(db.String(20), default='light')
    working_hours_start = db.Column(db.String(10), default='09:00')
    working_hours_end = db.Column(db.String(10), default='17:00')

class Task(db.Model):
    __tablename__ = 'tasks'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    due_date = db.Column(db.String(20), nullable=False)
    priority = db.Column(db.String(20), default='medium')
    status = db.Column(db.String(20), default='pending')
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=True)
    parent_id = db.Column(db.Integer, nullable=True)
    is_recurring = db.Column(db.Boolean, default=False)
    recurrence_rule = db.Column(db.String(50), nullable=True)
    completed_at = db.Column(db.String(30), nullable=True)
    reminder_time = db.Column(db.String(30), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'dueDate': self.due_date,
            'priority': self.priority,
            'status': self.status,
            'userId': self.user_id,
            'projectId': self.project_id,
            'parentId': self.parent_id,
            'isRecurring': self.is_recurring,
            'recurrenceRule': self.recurrence_rule
        }

# Initialize DB (Create tables)
with app.app_context():
    try:
        db.create_all()
        logger.info("Database tables created successfully.")
    except Exception as e:
        logger.error(f"Error creating database tables: {e}")

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 409

    new_user = User(username=username, password=password)
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'id': new_user.id, 'username': new_user.username}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username, password=password).first()
    
    if user:
        return jsonify({'id': user.id, 'username': user.username}), 200
    else:
        return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/projects', methods=['GET'])
def get_projects():
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400
    
    projects = Project.query.filter_by(user_id=user_id).all()
    return jsonify([{'id': p.id, 'name': p.name, 'color': p.color, 'userId': p.user_id} for p in projects]), 200

@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.json
    new_project = Project(
        name=data['name'],
        color=data.get('color', '#6366f1'),
        user_id=data['userId']
    )
    db.session.add(new_project)
    db.session.commit()
    return jsonify({'id': new_project.id, **data}), 201

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400
        
    tasks = Task.query.filter_by(user_id=user_id).all()
    return jsonify([t.to_dict() for t in tasks]), 200

@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.json
    new_task = Task(
        title=data.get('title'),
        description=data.get('description', ''),
        due_date=data.get('dueDate'),
        priority=data.get('priority', 'medium'),
        status=data.get('status', 'pending'),
        user_id=data.get('userId'),
        project_id=data.get('projectId'),
        parent_id=data.get('parentId'),
        is_recurring=data.get('isRecurring', False),
        recurrence_rule=data.get('recurrenceRule')
    )
    db.session.add(new_task)
    db.session.commit()
    return jsonify(new_task.to_dict()), 201

@app.route('/api/tasks/<int:id>', methods=['PUT'])
def update_task(id):
    data = request.json
    task = Task.query.get_or_404(id)
    
    task.title = data.get('title', task.title)
    task.description = data.get('description', task.description)
    task.due_date = data.get('dueDate', task.due_date)
    task.priority = data.get('priority', task.priority)
    task.status = data.get('status', task.status)
    task.project_id = data.get('projectId', task.project_id)
    task.parent_id = data.get('parentId', task.parent_id)
    task.is_recurring = data.get('isRecurring', task.is_recurring)
    task.recurrence_rule = data.get('recurrenceRule', task.recurrence_rule)
    
    db.session.commit()
    return jsonify(task.to_dict()), 200

@app.route('/api/tasks/<int:id>', methods=['DELETE'])
def delete_task(id):
    task = Task.query.get_or_404(id)
    
    # Cascade delete subtasks manually
    subtasks = Task.query.filter_by(parent_id=id).all()
    for subtask in subtasks:
        db.session.delete(subtask)
        
    db.session.delete(task)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print("Database initialized.")
    app.run(debug=True, port=5000)
