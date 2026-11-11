(() => {
  const MOBILE_BREAKPOINT = 767;

  const icons = {
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    classes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h8"/></svg>',
    activities: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 2h3v15H5V6h3zM9 12l2 2 4-4"/></svg>',
    records: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>'
  };

  function initials(name) {
    const value = String(name || 'User').trim();
    return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U';
  }

  function viewLabel(view) {
    const labels = {
      dashboard: 'Dashboard', admin: 'Admin', users: 'Users', classes: 'Classes', activities: 'Activities', exams: 'Exams', records: 'Records', monitoring: 'Student Monitoring'
    };
    return labels[view] || 'Dashboard';
  }

  function openDrawer() {
    document.body.classList.add('mobile-drawer-open');
    document.querySelector('.mobile-icon-button[data-mobile-menu]')?.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    document.body.classList.remove('mobile-drawer-open');
    document.querySelector('.mobile-icon-button[data-mobile-menu]')?.setAttribute('aria-expanded', 'false');
  }

  function toggleDrawer() {
    document.body.classList.contains('mobile-drawer-open') ? closeDrawer() : openDrawer();
  }

  function goTo(view) {
    if (view === 'more') {
      toggleDrawer();
      return;
    }
    if (typeof state !== 'undefined') state.view = view;
    if (typeof persist === 'function') persist();
    if (typeof render === 'function') render();
    closeDrawer();
  }

  function bottomItem(view, label, icon) {
    const active = view !== 'more' && state?.view === view ? ' active' : '';
    return `<button type="button" class="${active.trim()}" data-mobile-view="${view}" aria-label="${label}">${icon}<span>${label}</span></button>`;
  }

  function enhanceMobileShell() {
    const shell = document.querySelector('.shell');
    const sidebar = document.querySelector('.sidebar');
    if (!shell || !sidebar || typeof user !== 'function' || !user()) {
      document.body.classList.remove('mobile-drawer-open');
      document.body.removeAttribute('data-klaseph-view');
      return;
    }

    document.body.dataset.klasephView = state?.view || 'dashboard';

    if (!shell.querySelector('.mobile-header')) {
      const header = document.createElement('header');
      header.className = 'mobile-header';
      header.innerHTML = `
        <div class="mobile-header-left">
          <div class="mobile-mark">K</div>
          <div class="mobile-heading"><strong>KlasePH</strong><span>${viewLabel(state?.view)}</span></div>
        </div>
        <div class="mobile-header-actions">
          <button type="button" class="mobile-icon-button mobile-avatar" data-mobile-profile aria-label="Open account menu">${initials(user().name)}</button>
          <button type="button" class="mobile-icon-button" data-mobile-menu aria-label="Open navigation menu" aria-expanded="false">${icons.menu}</button>
        </div>`;
      shell.prepend(header);
    }

    if (!document.querySelector('.mobile-drawer-backdrop')) {
      const backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.className = 'mobile-drawer-backdrop';
      backdrop.setAttribute('aria-label', 'Close navigation menu');
      document.body.appendChild(backdrop);
    }

    if (!shell.querySelector('.mobile-bottom-nav')) {
      const nav = document.createElement('nav');
      nav.className = 'mobile-bottom-nav';
      nav.setAttribute('aria-label', 'Primary mobile navigation');
      nav.innerHTML = [
        bottomItem('dashboard', 'Home', icons.home),
        bottomItem('classes', 'Classes', icons.classes),
        bottomItem('activities', 'Activities', icons.activities),
        bottomItem('records', 'Records', icons.records),
        bottomItem('more', 'More', icons.more)
      ].join('');
      shell.appendChild(nav);
    }

    shell.querySelector('.mobile-heading span').textContent = viewLabel(state?.view);
    shell.querySelector('.mobile-avatar').textContent = initials(user().name);
    shell.querySelectorAll('[data-mobile-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mobileView !== 'more' && button.dataset.mobileView === state?.view);
      button.onclick = () => goTo(button.dataset.mobileView);
    });
    shell.querySelector('[data-mobile-menu]').onclick = toggleDrawer;
    shell.querySelector('[data-mobile-profile]').onclick = openDrawer;
    document.querySelector('.mobile-drawer-backdrop').onclick = closeDrawer;

    sidebar.querySelectorAll('[data-view],[data-lang],#signOut').forEach((button) => {
      button.addEventListener('click', closeDrawer, { once: true });
    });
  }

  const originalRender = typeof render === 'function' ? render : null;
  if (originalRender) {
    render = function mobileAwareRender(...args) {
      const result = originalRender.apply(this, args);
      queueMicrotask(enhanceMobileShell);
      return result;
    };
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > MOBILE_BREAKPOINT) closeDrawer();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
  });

  queueMicrotask(enhanceMobileShell);
})();
