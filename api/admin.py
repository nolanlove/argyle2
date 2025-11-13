from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model
from .models import Song

User = get_user_model()


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'name', 'is_active', 'is_staff', 'created_at']
    list_filter = ['is_active', 'is_staff', 'created_at']
    search_fields = ['email', 'name']
    ordering = ['-created_at']
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Additional Info', {'fields': ('name',)}),
    )


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'is_public', 'created_at']
    list_filter = ['is_public', 'created_at']
    search_fields = ['title', 'user__email']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']
