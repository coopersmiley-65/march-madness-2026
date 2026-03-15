/**
 * Login/Register View
 */
import { api } from '../api.js';

export function renderLogin() {
    const container = document.createElement('div');
    container.className = 'login-view';

    container.innerHTML = `
        <div class="login-container">
            <div class="login-hero">
                <div class="hero-icon">🏀</div>
                <h1>March Madness 2026</h1>
                <p class="hero-subtitle">Tournament Betting Game</p>
            </div>

            <div class="login-card">
                <div class="login-tabs">
                    <button class="login-tab active" data-tab="login">Sign In</button>
                    <button class="login-tab" data-tab="register">Create Account</button>
                </div>

                <form id="login-form" class="auth-form">
                    <div class="form-group">
                        <label for="login-username">Username</label>
                        <input type="text" id="login-username" placeholder="Enter username" required autocomplete="username" />
                    </div>
                    <div class="form-group">
                        <label for="login-password">Password</label>
                        <input type="password" id="login-password" placeholder="Enter password" required autocomplete="current-password" />
                    </div>
                    <button type="submit" class="btn btn-primary btn-full">Sign In</button>
                    <div class="form-error" id="login-error"></div>
                </form>

                <form id="register-form" class="auth-form" style="display:none">
                    <div class="form-group">
                        <label for="reg-display">Display Name</label>
                        <input type="text" id="reg-display" placeholder="Your name (e.g. Rick)" required maxlength="20" />
                    </div>
                    <div class="form-group">
                        <label for="reg-player">Player Number</label>
                        <select id="reg-player" required>
                            <option value="">Select your player slot...</option>
                            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}">Player ${n}${n === 1 ? ' (Admin)' : ''}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="reg-username">Username</label>
                        <input type="text" id="reg-username" placeholder="Choose a username" required autocomplete="username" />
                    </div>
                    <div class="form-group">
                        <label for="reg-password">Password</label>
                        <input type="password" id="reg-password" placeholder="Choose a password" required minlength="4" autocomplete="new-password" />
                    </div>
                    <button type="submit" class="btn btn-primary btn-full">Create Account</button>
                    <div class="form-error" id="register-error"></div>
                </form>
            </div>

            <div class="login-footer">
                <p>Private game for invited players only</p>
            </div>
        </div>
    `;

    setTimeout(() => {
        // Tab switching
        container.querySelectorAll('.login-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                container.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const isLogin = tab.dataset.tab === 'login';
                container.querySelector('#login-form').style.display = isLogin ? '' : 'none';
                container.querySelector('#register-form').style.display = isLogin ? 'none' : '';
            });
        });

        // Login form
        container.querySelector('#login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = container.querySelector('#login-username').value.trim();
            const password = container.querySelector('#login-password').value;
            const errorEl = container.querySelector('#login-error');
            errorEl.textContent = '';

            try {
                const { user } = await api.login(username, password);
                window.appState.user = user;
                window.dispatchEvent(new CustomEvent('authChange'));
            } catch (err) {
                errorEl.textContent = err.message;
            }
        });

        // Register form
        container.querySelector('#register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const display_name = container.querySelector('#reg-display').value.trim();
            const player_number = parseInt(container.querySelector('#reg-player').value);
            const username = container.querySelector('#reg-username').value.trim();
            const password = container.querySelector('#reg-password').value;
            const errorEl = container.querySelector('#register-error');
            errorEl.textContent = '';

            if (!player_number) {
                errorEl.textContent = 'Please select a player number';
                return;
            }

            try {
                const { user } = await api.register(username, password, display_name, player_number);
                window.appState.user = user;
                window.dispatchEvent(new CustomEvent('authChange'));
            } catch (err) {
                errorEl.textContent = err.message;
            }
        });
    }, 0);

    return container;
}
