// Authentication UI Components
class AuthUI {
  constructor() {
    this.currentUser = null;
    this.init();
  }

  async init() {
    console.log('AuthUI init called');
    await this.checkAuthStatus();
    console.log('Auth status checked, rendering UI');
    this.renderAuthUI();
    console.log('AuthUI init complete');
  }

  async checkAuthStatus() {
    try {
      // Check if we're on localhost and enable mock mode
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Check for mock login in sessionStorage
        const mockUser = sessionStorage.getItem('mockUser');
        if (mockUser) {
          this.currentUser = JSON.parse(mockUser);
          console.log('Mock user authenticated:', this.currentUser);
          return;
        }
      }

      const response = await fetch('/api/auth/me');
      const result = await response.json();
      
      if (result.success && result.user) {
        this.currentUser = result.user;
        console.log('User authenticated:', this.currentUser);
      } else {
        this.currentUser = null;
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      this.currentUser = null;
    }
  }

  renderAuthUI() {
    const authContainer = document.getElementById('auth-container');
    console.log('renderAuthUI called, authContainer:', !!authContainer);
    if (!authContainer) return;

    if (this.currentUser) {
      // User is logged in - compact design with dropdown menu
      authContainer.innerHTML = `
        <div class="auth-user-info">
          <div class="user-profile" id="user-menu-trigger">
            <div class="user-email">${this.currentUser.email}</div>
            <div class="menu-arrow">▼</div>
          </div>
          <div class="user-menu" id="user-menu">
            <div class="menu-item" id="logout-btn">
              <span>Logout</span>
            </div>
          </div>
        </div>
      `;
    } else {
      // User is not logged in
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      authContainer.innerHTML = `
        <div class="auth-login">
          <h3>Sign in to save your songs</h3>
          <p>Create an account to save and share your musical creations</p>
          ${isLocalhost ? `
            <div class="mock-login-section">
              <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 12px;">
                🧪 <strong>Development Mode:</strong> Use mock login to test the UI
              </p>
              <button id="mock-login-btn" class="btn btn-secondary" style="margin-bottom: 16px;">
                🧪 Mock Login (Test User)
              </button>
            </div>
          ` : ''}
          <div class="auth-email-form">
            <form id="email-auth-form">
              <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" name="email" required>
              </div>
              <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary">Sign In</button>
                <button type="button" id="signup-toggle" class="btn btn-secondary">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    this.bindAuthEvents();
  }

  bindAuthEvents() {
    // Email form handling
    const form = document.getElementById('email-auth-form');
    const signupToggle = document.getElementById('signup-toggle');
    
    console.log('Binding auth events:', { form: !!form, signupToggle: !!signupToggle });
    
    if (form) {
      form.addEventListener('submit', (e) => {
        console.log('Form submitted');
        e.preventDefault();
        this.handleEmailAuth();
      });
    }
    
    if (signupToggle) {
      signupToggle.addEventListener('click', () => {
        this.toggleSignupMode();
      });
    }

    // Mock login button (only on localhost)
    const mockLoginBtn = document.getElementById('mock-login-btn');
    if (mockLoginBtn) {
      mockLoginBtn.addEventListener('click', () => {
        this.mockLogin();
      });
    }

    // User menu dropdown functionality
    const userMenuTrigger = document.getElementById('user-menu-trigger');
    const userMenu = document.getElementById('user-menu');
    
    if (userMenuTrigger && userMenu) {
      userMenuTrigger.addEventListener('click', () => {
        userMenu.classList.toggle('menu-open');
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!userMenuTrigger.contains(e.target) && !userMenu.contains(e.target)) {
          userMenu.classList.remove('menu-open');
        }
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.signOut());
    }
  }

  async signIn(provider) {
    try {
      window.location.href = `/api/auth/signin/${provider}`;
    } catch (error) {
      console.error('Sign in error:', error);
    }
  }

  async signOut() {
    try {
      // Check if we're in mock mode
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        sessionStorage.removeItem('mockUser');
        this.currentUser = null;
        this.renderAuthUI();
        console.log('Mock user logged out');
        return;
      }

      await fetch('/api/auth/logout', { method: 'POST' });
      this.currentUser = null;
      this.renderAuthUI();
      window.location.reload();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  mockLogin() {
    // Create a mock user for testing
    const mockUser = {
      id: 'mock-user-123',
      email: 'test@example.com',
      name: 'Test User'
    };
    
    // Store in sessionStorage for persistence during the session
    sessionStorage.setItem('mockUser', JSON.stringify(mockUser));
    
    // Update current user and re-render
    this.currentUser = mockUser;
    this.renderAuthUI();
    
    console.log('Mock user logged in:', mockUser);
  }

  toggleSignupMode() {
    const form = document.getElementById('email-auth-form');
    const submitBtn = form.querySelector('button[type="submit"]');
    const toggleBtn = document.getElementById('signup-toggle');
    
    if (submitBtn.textContent === 'Sign In') {
      // Switch to signup mode
      submitBtn.textContent = 'Create Account';
      toggleBtn.textContent = 'Sign In Instead';
      form.dataset.mode = 'signup';
    } else {
      // Switch to signin mode
      submitBtn.textContent = 'Sign In';
      toggleBtn.textContent = 'Create Account';
      form.dataset.mode = 'signin';
    }
  }

  async handleEmailAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const form = document.getElementById('email-auth-form');
    const isSignup = form.dataset.mode === 'signup';

    // Clear any existing error messages
    this.clearAuthError();

    console.log('Auth attempt:', { email, isSignup, mode: form.dataset.mode });

    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      console.log('Making request to:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response result:', result);

      if (response.ok && result.success) {
        console.log('Auth successful, updating UI');
        await this.checkAuthStatus();
        this.renderAuthUI();
      } else {
        console.log('Auth failed:', result.error);
        this.showAuthError(result.error || (isSignup ? 'Signup failed' : 'Invalid credentials'));
      }
    } catch (error) {
      console.error('Email auth error:', error);
      this.showAuthError('Authentication failed. Please try again.');
    }
  }

  showAuthError(message) {
    const form = document.getElementById('email-auth-form');
    if (!form) return;

    // Remove any existing error message
    this.clearAuthError();

    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'auth-error-message';
    errorDiv.textContent = message;

    // Insert error message before the form actions
    const formActions = form.querySelector('.form-actions');
    if (formActions) {
      formActions.parentNode.insertBefore(errorDiv, formActions);
    }
  }

  clearAuthError() {
    const existingError = document.querySelector('.auth-error-message');
    if (existingError) {
      existingError.remove();
    }
  }


}

// Initialize auth UI when DOM is loaded
function initAuthUI() {
  console.log('initAuthUI called');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded, initializing AuthUI');
      window.authUI = new AuthUI();
    });
  } else {
    console.log('DOM already loaded, initializing AuthUI immediately');
    window.authUI = new AuthUI();
  }
}

// Try to initialize immediately
initAuthUI(); 