from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


class EmailBackend(ModelBackend):
    """
    Custom authentication backend that uses email instead of username.
    This is needed because Django's default ModelBackend expects a username field,
    but our User model uses email as USERNAME_FIELD.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        logger.info(f"EmailBackend.authenticate called with username={username}, password={'*' * len(password) if password else None}")
        
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)
        
        if username is None or password is None:
            logger.warning("EmailBackend: username or password is None")
            return None
        
        try:
            # Get user by email (since USERNAME_FIELD is 'email')
            user = User.objects.get(email=username)
            logger.info(f"EmailBackend: Found user {user.email}")
        except User.DoesNotExist:
            logger.warning(f"EmailBackend: User with email {username} does not exist")
            # Run the default password hasher once to reduce the timing
            # difference between an existing and a non-existing user
            User().set_password(password)
            return None
        
        # Check password and user permissions
        password_valid = user.check_password(password)
        can_authenticate = self.user_can_authenticate(user)
        logger.info(f"EmailBackend: password_valid={password_valid}, can_authenticate={can_authenticate}, is_active={user.is_active}")
        
        if password_valid and can_authenticate:
            logger.info(f"EmailBackend: Authentication successful for {user.email}")
            return user
        
        logger.warning(f"EmailBackend: Authentication failed for {user.email}")
        return None

