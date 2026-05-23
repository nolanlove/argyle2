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
      const response = await fetch('/api/auth/me', {
        credentials: 'include'  // Include cookies in the request
      });
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
      // User is not logged in — round person icon opens a centered modal
      // with Sign in / Create account tabs (two completely separate <form>s
      // so the browser autofill behaves correctly per-pane).
      authContainer.innerHTML = `
        <button type="button" id="auth-trigger" class="auth-icon-btn" aria-label="Sign in or create account" aria-expanded="false" aria-controls="auth-modal">
          ${this.personIconSVG()}
        </button>
        <div class="auth-modal-backdrop" id="auth-modal-backdrop" hidden>
          <div class="auth-modal" id="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
            <button type="button" class="auth-popover-close" id="auth-popover-close" aria-label="Close">×</button>
            <div class="auth-tabs" role="tablist">
              <button type="button" class="auth-tab is-active" data-tab="signin" role="tab" aria-selected="true">Sign in</button>
              <button type="button" class="auth-tab" data-tab="signup" role="tab" aria-selected="false">Create account</button>
            </div>
            <h3 id="auth-modal-title" class="visually-hidden">Account</h3>

            <!-- SIGN IN -->
            <section class="auth-pane" data-pane="signin">
              <div class="auth-email-form">
                <form id="signin-form" autocomplete="on" novalidate>
                  <div class="form-group">
                    <label for="signin-email">Email</label>
                    <input type="email" id="signin-email" name="email"
                           autocomplete="username"
                           autocapitalize="off" autocorrect="off" spellcheck="false"
                           required>
                  </div>
                  <div class="form-group">
                    <label for="signin-password">Password</label>
                    <input type="password" id="signin-password" name="password"
                           autocomplete="current-password"
                           required>
                  </div>
                  <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Sign in</button>
                  </div>
                </form>
              </div>
            </section>

            <!-- CREATE ACCOUNT -->
            <section class="auth-pane" data-pane="signup" hidden>
              <div class="auth-email-form">
                <form id="signup-form" autocomplete="on" novalidate>
                  <div class="form-group">
                    <label for="signup-email">Email</label>
                    <input type="email" id="signup-email" name="email"
                           autocomplete="username"
                           autocapitalize="off" autocorrect="off" spellcheck="false"
                           required>
                  </div>
                  <div class="form-group">
                    <label for="signup-password">Password</label>
                    <input type="password" id="signup-password" name="new-password"
                           autocomplete="new-password"
                           minlength="8"
                           required>
                  </div>
                  <div class="form-group">
                    <label for="signup-password-confirm">Confirm password</label>
                    <input type="password" id="signup-password-confirm" name="new-password-confirm"
                           autocomplete="new-password"
                           minlength="8"
                           required>
                  </div>
                  <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Create account</button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        </div>
      `;
    }

    this.bindAuthEvents();
  }

  personIconSVG() {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"></path>
      </svg>`;
  }

  setModalOpen(open) {
    const trigger = document.getElementById('auth-trigger');
    const backdrop = document.getElementById('auth-modal-backdrop');
    if (!trigger || !backdrop) return;
    if (open) {
      backdrop.hidden = false;
      document.body.classList.add('auth-modal-open');
      trigger.setAttribute('aria-expanded', 'true');
    } else {
      backdrop.hidden = true;
      document.body.classList.remove('auth-modal-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  showPane(name) {
    document.querySelectorAll('.auth-pane').forEach((el) => {
      el.hidden = el.dataset.pane !== name;
    });
    document.querySelectorAll('.auth-tab').forEach((el) => {
      const active = el.dataset.tab === name;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const visible = document.querySelector(`.auth-pane[data-pane="${name}"]`);
    if (visible) {
      const first = visible.querySelector('input');
      if (first) setTimeout(() => first.focus(), 0);
    }
  }

  bindAuthEvents() {
    // Auth modal trigger (only present when logged out)
    const trigger = document.getElementById('auth-trigger');
    const backdrop = document.getElementById('auth-modal-backdrop');
    const modal = document.getElementById('auth-modal');
    const popoverClose = document.getElementById('auth-popover-close');

    if (trigger && backdrop && modal) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const opening = backdrop.hidden;
        this.setModalOpen(opening);
        if (opening) this.showPane('signin');
      });

      if (popoverClose) {
        popoverClose.addEventListener('click', () => this.setModalOpen(false));
      }

      // Backdrop click to dismiss (but not clicks inside the modal card).
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.setModalOpen(false);
      });

      // Escape to dismiss.
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !backdrop.hidden) this.setModalOpen(false);
      });
    }

    // Tabs
    document.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.showPane(tab.dataset.tab));
    });

    const signinForm = document.getElementById('signin-form');
    if (signinForm) {
      signinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSignin();
      });
    }
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSignup();
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
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include'  // Include cookies
      });
      this.currentUser = null;
      this.renderAuthUI();
      window.location.reload();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }


  async handleSignin() {
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;

    this.clearAuthError('signin-form');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        document.body.classList.remove('auth-modal-open');
        await new Promise((r) => setTimeout(r, 100));
        await this.checkAuthStatus();
        this.renderAuthUI();
      } else {
        this.showAuthError(result.error || 'Invalid credentials', 'signin-form');
      }
    } catch (error) {
      console.error('Signin error:', error);
      this.showAuthError('Sign-in failed. Please try again.', 'signin-form');
    }
  }

  async handleSignup() {
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-password-confirm').value;

    this.clearAuthError('signup-form');

    if (password.length < 8) {
      this.showAuthError('Password must be at least 8 characters.', 'signup-form');
      return;
    }
    if (password !== confirm) {
      this.showAuthError("Passwords don't match.", 'signup-form');
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        document.body.classList.remove('auth-modal-open');
        await new Promise((r) => setTimeout(r, 100));
        await this.checkAuthStatus();
        this.renderAuthUI();
      } else {
        this.showAuthError(result.error || 'Signup failed', 'signup-form');
      }
    } catch (error) {
      console.error('Signup error:', error);
      this.showAuthError('Signup failed. Please try again.', 'signup-form');
    }
  }

  showAuthError(message, formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    this.clearAuthError(formId);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'auth-error-message';
    errorDiv.textContent = message;
    const formActions = form.querySelector('.form-actions');
    if (formActions) formActions.parentNode.insertBefore(errorDiv, formActions);
  }

  clearAuthError(formId) {
    const scope = formId ? document.getElementById(formId) : document;
    if (!scope) return;
    scope.querySelectorAll('.auth-error-message').forEach((el) => el.remove());
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