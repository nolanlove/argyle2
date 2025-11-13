# Argyle - Django Version

Django port of the Argyle musical grid application.

## Setup

1. **Create virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables:**
   Create a `.env` file:
   ```
   SECRET_KEY=your-secret-key-here
   DEBUG=True
   STORAGE_URL=postgresql://user:password@host:port/database
   OPENAI_API_KEY=your-openai-key
   NEXTAUTH_SECRET=your-jwt-secret
   ```

4. **Run migrations:**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

5. **Create superuser (for admin panel):**
   ```bash
   python manage.py createsuperuser
   ```

6. **Collect static files:**
   ```bash
   python manage.py collectstatic --noinput
   ```

7. **Run development server:**
   ```bash
   python manage.py runserver
   ```

## Deployment to Heroku

1. **Install Heroku CLI** (if not already installed)

2. **Login to Heroku:**
   ```bash
   heroku login
   ```

3. **Create Heroku app:**
   ```bash
   heroku create argyle-app
   ```

4. **Add PostgreSQL addon:**
   ```bash
   heroku addons:create heroku-postgresql:mini
   ```

5. **Set environment variables:**
   ```bash
   heroku config:set SECRET_KEY=your-secret-key
   heroku config:set OPENAI_API_KEY=your-key
   heroku config:set NEXTAUTH_SECRET=your-secret
   heroku config:set DEBUG=False
   ```

6. **Deploy:**
   ```bash
   git push heroku main
   ```

7. **Run migrations on Heroku:**
   ```bash
   heroku run python manage.py migrate
   heroku run python manage.py createsuperuser
   ```

## Admin Panel

Access the Django admin panel at `/admin/` after creating a superuser.

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/openai/chat` - OpenAI chat completion
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User signup
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - User logout
- `GET /api/songs/` - List songs
- `POST /api/songs/` - Create song
- `GET /api/songs/{id}/` - Get song

## Project Structure

```
argyle2/
├── api/              # API app (models, views, serializers)
├── accounts/         # Accounts app (if needed)
├── argyle/           # Django project settings
├── static/           # Static files (JS, CSS, images)
├── templates/        # HTML templates
├── manage.py         # Django management script
├── requirements.txt  # Python dependencies
├── Procfile         # Heroku process file
└── runtime.txt      # Python version
```

