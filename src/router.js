/**
 * Simple router – handles view switching in our single-page app.
 */

export class Router {
    constructor(views, container) {
        this.views = views;
        this.container = container;
        this.currentView = null;
    }

    navigate(viewName) {
        if (this.currentView === viewName) return;
        this.currentView = viewName;

        const viewFn = this.views[viewName];
        if (!viewFn) {
            console.error(`View not found: ${viewName}`);
            return;
        }

        // Clear container and render the new view
        this.container.innerHTML = '';
        const viewEl = viewFn();
        if (viewEl) {
            this.container.appendChild(viewEl);
        }

        // Update active nav state
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.view === viewName);
        });

        // Scroll to top
        window.scrollTo(0, 0);
    }
}
