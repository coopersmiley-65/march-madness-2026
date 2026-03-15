/**
 * Invitations View – Admin page for sending player invitations via email.
 * Uses mailto: links to open the user's email client with pre-composed invitations.
 */
import { api } from '../api.js';

export async function renderInvitations() {
    const container = document.createElement('div');
    container.className = 'invitations-view';

    // Fetch registered players
    let players = [];
    try {
        const res = await api.getWagerSuggestions(); // reuse to get player list
        players = res.suggestions || [];
    } catch (e) { /* ignore */ }

    // Get site URL for the invitation
    const siteUrl = window.location.origin;

    container.innerHTML = `
        <div class="view-header">
            <h1>✉️ Player Invitations</h1>
            <p class="view-subtitle">Send invitation emails to your players. Enter their email, then click "Send Invite" to open a pre-composed email in your email client.</p>
        </div>

        <div class="invite-settings-card">
            <h3>📧 Site URL</h3>
            <p class="card-description">This URL will be included in all invitation emails.</p>
            <input type="text" id="invite-site-url" class="invite-url-input" value="${siteUrl}" placeholder="https://your-site.vercel.app" />
        </div>

        <div class="invite-players-card">
            <h3>👥 Players</h3>
            <div class="invite-grid">
                ${Array.from({ length: 10 }, (_, i) => {
        const num = i + 1;
        const player = players.find(p => p.player_number === num);
        const name = player ? player.display_name : `Player ${num}`;
        const registered = !!player;
        return `
                        <div class="invite-row" data-player="${num}">
                            <div class="invite-player-info">
                                <span class="invite-player-num">#${num}</span>
                                <span class="invite-player-name">${name}</span>
                                ${registered ? '<span class="invite-badge registered">Registered</span>' : '<span class="invite-badge unregistered">Not Registered</span>'}
                            </div>
                            <div class="invite-actions">
                                <input type="email" class="invite-email-input" data-player="${num}" placeholder="email@example.com" />
                                <button class="btn btn-primary invite-send-btn" data-player="${num}" data-name="${name}">
                                    ✉️ Send Invite
                                </button>
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>

        <div class="invite-bulk-card">
            <h3>📨 Send to All</h3>
            <p class="card-description">Enter all email addresses (one per player slot above), then send invitations to everyone at once.</p>
            <button class="btn btn-primary" id="send-all-invites">✉️ Send All Invitations</button>
        </div>
    `;

    // Wire up individual send buttons
    container.querySelectorAll('.invite-send-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const playerNum = btn.dataset.player;
            const playerName = btn.dataset.name;
            const emailInput = container.querySelector(`.invite-email-input[data-player="${playerNum}"]`);
            const email = emailInput.value.trim();
            const url = container.querySelector('#invite-site-url').value.trim();

            if (!email) {
                emailInput.focus();
                emailInput.style.borderColor = '#ef4444';
                setTimeout(() => emailInput.style.borderColor = '', 2000);
                return;
            }

            openInviteEmail(email, playerNum, playerName, url);
        });
    });

    // Wire up "Send All" button
    container.querySelector('#send-all-invites').addEventListener('click', () => {
        const url = container.querySelector('#invite-site-url').value.trim();
        const inputs = container.querySelectorAll('.invite-email-input');
        let sentCount = 0;

        inputs.forEach(input => {
            const email = input.value.trim();
            if (!email) return;
            const playerNum = input.dataset.player;
            const row = container.querySelector(`.invite-row[data-player="${playerNum}"]`);
            const name = row.querySelector('.invite-player-name').textContent;

            // Small delay between opens to avoid browser blocking
            setTimeout(() => {
                openInviteEmail(email, playerNum, name, url);
            }, sentCount * 500);
            sentCount++;
        });

        if (sentCount === 0) {
            alert('Please enter at least one email address.');
        }
    });

    return container;
}

function openInviteEmail(email, playerNum, playerName, siteUrl) {
    const subject = encodeURIComponent(`🏀 You're Invited! March Madness 2026 Bracket Challenge`);

    const body = encodeURIComponent(
        `Hey${playerName !== `Player ${playerNum}` ? ` ${playerName}` : ''},

You've been invited to join our March Madness 2026 Bracket Challenge!

We've set up a private online bracket where you can pick winners for every game in the NCAA Tournament, compete against friends, and win the pot.

HOW TO JOIN
-----------
1. Go to: ${siteUrl}
2. Register with your assigned Player Number: ${playerNum}
3. Set your password and display name
4. Make your picks before the tournament starts!

YOUR LOGIN INFO
---------------
Player Number: ${playerNum}

HOW IT WORKS
------------
• Pick a winner for every game (Team A or Team B)
• Correct picks split the pot with other correct pickers
• Scores update automatically from ESPN every hour
• Leaderboard tracks everyone's winnings in real time

KEY DATES
---------
• Now – Mar 19: Register & make your picks
• Mar 19 at Noon ET: Picks lock — tournament begins!
• Mar 19 – Apr 7: Watch games, results auto-update
• Apr 7: Champion crowned, final payouts

IMPORTANT: All picks must be submitted before noon ET on March 19. After that, the bracket locks and no changes can be made.

Let me know if you have any questions. Good luck! 🏆
`
    );

    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
}
