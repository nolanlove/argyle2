from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Extended user model"""
    email = models.EmailField(unique=True)  # Override to make unique
    name = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []  # Remove username from required fields

    class Meta:
        db_table = 'users'
        ordering = ['-created_at']


class Song(models.Model):
    """Song/sequence model"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='songs')
    title = models.CharField(max_length=255)
    sequence = models.TextField()  # JSON string
    key_info = models.CharField(max_length=100, blank=True, null=True)
    bpm = models.IntegerField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'songs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['is_public']),
        ]

    def __str__(self):
        return self.title
