from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Song

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'created_at']
        read_only_fields = ['id', 'created_at']


class SongSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='user.name', read_only=True)
    
    class Meta:
        model = Song
        fields = ['id', 'user', 'title', 'sequence', 'key_info', 'bpm', 
                  'notes', 'is_public', 'created_at', 'updated_at', 'author_name']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at', 'author_name']

