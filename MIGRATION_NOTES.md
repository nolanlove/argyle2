# Migration Notes: Node.js/Vercel → Django/Heroku

## What Was Ported

### ✅ Completed

1. **Models**
   - User model (extended Django's AbstractUser)
   - Song model (with all fields from original schema)

2. **API Endpoints**
   - `/api/health` - Health check
   - `/api/openai/chat` - OpenAI chat completion
   - `/api/auth/login` - User login with JWT
   - `/api/auth/signup` - User registration
   - `/api/auth/logout` - User logout
   - `/api/auth/me` - Get current user
   - `/api/songs/` - List and create songs
   - `/api/songs/{id}/` - Get individual song

3. **Frontend**
   - All static files copied to `static/` directory
   - Template updated to use Django static tags
   - All JavaScript files preserved

4. **Admin Panel**
   - Django admin configured
   - User and Song models registered
   - Accessible at `/admin/` after creating superuser

5. **Deployment Files**
   - `Procfile` for Heroku
   - `requirements.txt` with all dependencies
   - `runtime.txt` for Python version
   - `.gitignore` configured

## Key Differences from Original

### Authentication
- **Original**: JWT tokens in cookies (same approach maintained)
- **Django**: Uses Django's user model but maintains JWT for API compatibility

### Database
- **Original**: Direct Neon SQL queries
- **Django**: Uses Django ORM (can still use STORAGE_URL connection string)

### Static Files
- **Original**: Served directly by Vercel
- **Django**: Served via WhiteNoise in production, Django dev server in development

### API Structure
- **Original**: Individual serverless function files
- **Django**: DRF viewsets and function-based views

## Next Steps

1. **Set up database:**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

2. **Create superuser:**
   ```bash
   python manage.py createsuperuser
   ```

3. **Test locally:**
   ```bash
   python manage.py runserver
   ```

4. **Deploy to Heroku:**
   - Follow README.md instructions
   - Set environment variables
   - Run migrations on Heroku

## Environment Variables Needed

- `SECRET_KEY` - Django secret key
- `STORAGE_URL` - Database connection string (or individual DB_* vars)
- `OPENAI_API_KEY` - OpenAI API key
- `NEXTAUTH_SECRET` - JWT secret (can use SECRET_KEY)
- `DEBUG` - Set to False in production
- `ALLOWED_HOSTS` - Comma-separated list of allowed hosts

## Admin Panel Access

After creating a superuser, access the admin panel at:
- Local: `http://localhost:8000/admin/`
- Production: `https://your-app.herokuapp.com/admin/`

## API Compatibility

The API endpoints maintain the same structure as the original:
- Same request/response formats
- Same authentication method (JWT in cookies)
- Same CORS handling

Frontend code should work without changes (API URLs remain the same).

