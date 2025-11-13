from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.middleware.csrf import get_token
import jwt
from datetime import datetime, timedelta
import os
from openai import OpenAI

from .models import Song
from .serializers import SongSerializer, UserSerializer

User = get_user_model()


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Health check endpoint"""
    return Response({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'environment': os.environ.get('DJANGO_SETTINGS_MODULE', 'development'),
        'openaiConfigured': bool(os.environ.get('OPENAI_API_KEY')),
        'version': '1.0.0'
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def openai_chat(request):
    """OpenAI chat endpoint"""
    messages = request.data.get('messages')
    model = request.data.get('model', 'gpt-4o')
    max_tokens = request.data.get('max_tokens', 4000)
    temperature = request.data.get('temperature', 0.7)

    if not messages or not isinstance(messages, list):
        return Response(
            {'error': 'Invalid messages format'},
            status=status.HTTP_400_BAD_REQUEST
        )

    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        return Response(
            {'error': 'OpenAI API key not configured'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        return Response({
            'id': response.id,
            'object': response.object,
            'created': response.created,
            'model': response.model,
            'choices': [{
                'index': choice.index,
                'message': {
                    'role': choice.message.role,
                    'content': choice.message.content
                },
                'finish_reason': choice.finish_reason
            } for choice in response.choices],
            'usage': {
                'prompt_tokens': response.usage.prompt_tokens,
                'completion_tokens': response.usage.completion_tokens,
                'total_tokens': response.usage.total_tokens
            }
        })
    except Exception as e:
        return Response(
            {'error': f'OpenAI API error: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """User login endpoint"""
    email = request.data.get('email')
    password = request.data.get('password')

    if not email or not password:
        return Response(
            {'error': 'Email and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Use Django's authenticate function to use our custom backend
    from django.contrib.auth import authenticate
    user = authenticate(request, username=email, password=password)
    
    if user:
        # Create JWT token
        secret = os.environ.get('NEXTAUTH_SECRET') or os.environ.get('SECRET_KEY') or 'django-insecure-change-me-in-production'
        token = jwt.encode(
            {
                'userId': user.id,
                'email': user.email,
                'name': user.name or '',
                'exp': int((datetime.utcnow() + timedelta(days=7)).timestamp())
            },
            secret,
            algorithm='HS256'
        )

        response = Response({
            'success': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.name
            }
        })
        
        # Set HTTP-only cookie
        response.set_cookie(
            'auth-token',
            token,
            httponly=True,
            secure=False,  # Allow HTTP in development
            samesite='Strict',
            max_age=604800,  # 7 days
            path='/'
        )
        
        return response
    else:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def signup(request):
    """User signup endpoint"""
    email = request.data.get('email')
    password = request.data.get('password')
    name = request.data.get('name', '')

    if not email or not password:
        return Response(
            {'error': 'Email and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(email=email).exists():
        return Response(
            {'error': 'User with this email already exists'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        # Since USERNAME_FIELD is 'email', we pass email as username
        user = User.objects.create_user(
            email=email,  # This becomes the username since USERNAME_FIELD='email'
            password=password,
            name=name
        )
        
        # Create JWT token
        secret = os.environ.get('NEXTAUTH_SECRET') or os.environ.get('SECRET_KEY') or 'django-insecure-change-me-in-production'
        token = jwt.encode(
            {
                'userId': user.id,
                'email': user.email,
                'name': user.name or '',
                'exp': int((datetime.utcnow() + timedelta(days=7)).timestamp())
            },
            secret,
            algorithm='HS256'
        )

        response = Response({
            'success': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.name
            }
        }, status=status.HTTP_201_CREATED)
        
        # Set HTTP-only cookie
        response.set_cookie(
            'auth-token',
            token,
            httponly=True,
            secure=False,  # Allow HTTP in development
            samesite='Strict',
            max_age=604800,
            path='/'
        )
        
        return response
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([AllowAny])
def get_current_user(request):
    """Get current user from JWT token"""
    token = request.COOKIES.get('auth-token')
    
    if not token:
        return Response(
            {'success': False, 'error': 'Not authenticated'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    try:
        secret = os.environ.get('NEXTAUTH_SECRET') or os.environ.get('SECRET_KEY') or 'django-insecure-change-me-in-production'
        decoded = jwt.decode(token, secret, algorithms=['HS256'])
        user = User.objects.get(id=decoded['userId'])
        
        return Response({
            'success': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.name
            }
        })
    except (jwt.InvalidTokenError, User.DoesNotExist):
        return Response(
            {'success': False, 'error': 'Invalid token'},
            status=status.HTTP_401_UNAUTHORIZED
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def logout(request):
    """User logout endpoint"""
    response = Response({'success': True})
    response.delete_cookie('auth-token')
    return response


class SongViewSet(viewsets.ModelViewSet):
    """Song viewset"""
    serializer_class = SongSerializer
    permission_classes = [AllowAny]  # Will check auth in methods

    def get_queryset(self):
        user = self.get_user_from_token()
        
        if user:
            # Return user's songs
            return Song.objects.filter(user=user)
        else:
            # Return empty queryset for non-authenticated users
            return Song.objects.none()

    def get_user_from_token(self):
        """Helper to get user from JWT token"""
        token = self.request.COOKIES.get('auth-token')
        if not token:
            return None

        try:
            secret = os.environ.get('NEXTAUTH_SECRET') or os.environ.get('SECRET_KEY') or 'django-insecure-change-me-in-production'
            decoded = jwt.decode(token, secret, algorithms=['HS256'])
            return User.objects.get(id=decoded['userId'])
        except (jwt.InvalidTokenError, User.DoesNotExist):
            return None

    def list(self, request):
        """List songs - user's songs if authenticated, empty if not"""
        user = self.get_user_from_token()
        
        if user:
            songs = Song.objects.filter(user=user)
        else:
            songs = Song.objects.none()
        
        serializer = self.get_serializer(songs, many=True)
        return Response(serializer.data)

    def create(self, request):
        """Create a new song"""
        user = self.get_user_from_token()
        
        if not user:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=user)
        
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        """Get a specific song"""
        user = self.get_user_from_token()
        
        try:
            song = Song.objects.get(pk=pk)
            # Only allow if user owns it or it's public
            if song.user != user and not song.is_public:
                return Response(
                    {'error': 'Not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = self.get_serializer(song)
            return Response(serializer.data)
        except Song.DoesNotExist:
            return Response(
                {'error': 'Not found'},
                status=status.HTTP_404_NOT_FOUND
            )
