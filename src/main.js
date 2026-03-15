/**
 * March Madness 2026 – Main Entry Point with Authentication
 */
import './styles/main.css';
import { api } from './api.js';
import { renderLogin } from './views/login.js';
import { renderBracket } from './views/bracket.js';
import { renderBetting } from './views/betting.js';
import { renderLeaderboard } from './views/leaderboard.js';
import { renderSettings } from './views/settings.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAllPicks } from './views/allpicks.js';
import { renderInvitations } from './views/invitations.js';

// App state
window.appState = {
  user: null,
  currentView: 'bracket',
};

document.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');

  // Check if user is already logged in
  try {
    const { user } = await api.me();
    window.appState.user = user;
  } catch (e) {
    window.appState.user = null;
  }

  render();

  // Listen for re-render events
  window.addEventListener('rerender', () => render());
  window.addEventListener('navigate', (e) => {
    window.appState.currentView = e.detail.view;
    render();
  });
  window.addEventListener('authChange', () => render());
});

function render() {
  const app = document.getElementById('app');

  if (!window.appState.user) {
    app.innerHTML = '';
    const loginEl = renderLogin();
    app.appendChild(loginEl);
    return;
  }

  const user = window.appState.user;
  const currentView = window.appState.currentView || 'bracket';

  app.innerHTML = `
        <nav class="main-nav">
            <div class="nav-inner">
                <a class="nav-brand" href="#" id="brand-link">
                    <span class="brand-icon">🏀</span>
                    <span>March Madness 2026</span>
                </a>
                <div class="nav-links">
                    <button class="nav-link ${currentView === 'bracket' ? 'active' : ''}" data-view="bracket">
                        <span class="nav-icon">🗂️</span>
                        <span>Bracket</span>
                    </button>
                    <button class="nav-link ${currentView === 'betting' ? 'active' : ''}" data-view="betting">
                        <span class="nav-icon">🎯</span>
                        <span>My Picks</span>
                    </button>
                    <button class="nav-link ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">
                        <span class="nav-icon">📊</span>
                        <span>Dashboard</span>
                    </button>
                    <button class="nav-link ${currentView === 'leaderboard' ? 'active' : ''}" data-view="leaderboard">
                        <span class="nav-icon">🏆</span>
                        <span>Leaderboard</span>
                    </button>
                    <button class="nav-link ${currentView === 'allpicks' ? 'active' : ''}" data-view="allpicks">
                        <span class="nav-icon">👥</span>
                        <span>All Picks</span>
                    </button>
                    ${user.is_admin ? `
                    <button class="nav-link ${currentView === 'invitations' ? 'active' : ''}" data-view="invitations">
                        <span class="nav-icon">✉️</span>
                        <span>Invites</span>
                    </button>
                    <button class="nav-link ${currentView === 'settings' ? 'active' : ''}" data-view="settings">
                        <span class="nav-icon">⚙️</span>
                        <span>Admin</span>
                    </button>
                    ` : ''}
                </div>
                <div class="nav-user">
                    <span class="user-avatar">${user.display_name.charAt(0)}</span>
                    <span class="user-name">${user.display_name}</span>
                    <button class="nav-link logout-btn" id="logout-btn">
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </nav>
        <main class="main-content" id="main-content"></main>
    `;

  const contentEl = document.getElementById('main-content');

  // Nav handlers
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', () => {
      window.appState.currentView = link.dataset.view;
      render();
    });
  });

  document.getElementById('brand-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.appState.currentView = 'bracket';
    render();
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.logout();
    window.appState.user = null;
    window.dispatchEvent(new CustomEvent('authChange'));
  });

  // Render current view
  const views = {
    bracket: renderBracket,
    betting: renderBetting,
    dashboard: renderDashboard,
    leaderboard: renderLeaderboard,
    allpicks: renderAllPicks,
    invitations: renderInvitations,
    settings: renderSettings,
  };

  const viewFn = views[currentView];
  if (viewFn) {
    const viewEl = viewFn();
    if (viewEl instanceof Promise) {
      viewEl.then(el => {
        if (el) contentEl.appendChild(el);
      });
    } else if (viewEl) {
      contentEl.appendChild(viewEl);
    }
  }

  window.scrollTo(0, 0);
}
