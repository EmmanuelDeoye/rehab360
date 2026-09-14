// js/tools.js
// Creates a slide-out drawer from the home icon with dropdown-menu styling
// Includes an "Install App" button at the bottom of the drawer (only when applicable)

(function() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToolsDrawer);
  } else {
    initToolsDrawer();
  }

  function initToolsDrawer() {
    const homeIcon = document.querySelector('.home-icon');
    if (!homeIcon) {
      console.warn('No .home-icon element found – tools drawer not created');
      return;
    }

    // Define all available tools
    const tools = [
      { name: 'Home', url: 'index.html', icon: '🏠' },
      { name: 'Format Generator', url: 'format.html', icon: '📋' },
      { name: 'Standardized Tools', url: 'standardized.html', icon: '⚖️' },
      { name: 'Smart EMR', url: 'doc.html', icon: '🗂️' },
      { name: 'Audio Transcription', url: 'audio.html', icon: '🎧' },
      { name: 'Motion & Gait', url: 'rom.html', icon: '🦵' },
      { name: 'Report & Presentation', url: 'presentation.html', icon: '📑' },
      { name: 'Assignment Maker', url: 'assignment.html', icon: '📝' },
      { name: 'Project Maker', url: 'project.html', icon: '📚' },
      { name: 'Study Buddy', url: 'study.html', icon: '🧠' },
      { name: 'Exam Simulator', url: 'exam.html', icon: '⏱️' },
      { name: 'Ask Me', url: 'index.html', icon: '💬' }
    ];

    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const originalSvg = homeIcon.innerHTML;

    // Create the tools button with home icon + chevron
    const toolsBtn = document.createElement('button');
    toolsBtn.className = 'icon-btn tools-drawer-btn';
    toolsBtn.setAttribute('aria-label', 'Tools menu');
    toolsBtn.style.display = 'inline-flex';
    toolsBtn.style.alignItems = 'center';
    toolsBtn.style.gap = '4px';
    toolsBtn.innerHTML = `
      ${originalSvg}
      <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-left: 2px;">
        <polyline points="6 9 12 15 18 9" stroke="currentColor" fill="none" stroke-width="2"/>
      </svg>
    `;
    homeIcon.parentNode.replaceChild(toolsBtn, homeIcon);

    // Create the drawer
    const toolsDrawer = document.createElement('aside');
    toolsDrawer.className = 'tools-drawer';
    toolsDrawer.id = 'toolsDrawer';
    toolsDrawer.innerHTML = `
      <div class="tools-drawer-header">
        <div class="tools-drawer-title">
          <span class="tools-drawer-icon">🛠️</span>
          <span>All Tools</span>
        </div>
        <button id="closeToolsDrawerBtn" class="tools-drawer-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="tools-drawer-content">
        ${tools.map(tool => {
          const isActive = (tool.url === currentPath) || 
                         (currentPath === '' && tool.url === 'index.html');
          return `
            <a href="${tool.url}" class="tools-drawer-item ${isActive ? 'active' : ''}">
              <span class="tools-item-icon">${tool.icon}</span>
              <span class="tools-item-name">${tool.name}</span>
              ${isActive ? '<span class="tools-item-active">●</span>' : ''}
            </a>
          `;
        }).join('')}
        <div class="tools-drawer-divider"></div>
        <button class="tools-drawer-item install-app-btn" id="drawerInstallBtn" style="display: none;">
          <span class="tools-item-icon">📲</span>
          <span class="tools-item-name">Install App</span>
        </button>
      </div>
    `;
    document.body.appendChild(toolsDrawer);

    // Add overlay
    const overlay = document.createElement('div');
    overlay.className = 'tools-drawer-overlay';
    overlay.id = 'toolsDrawerOverlay';
    document.body.appendChild(overlay);

    // Drawer open/close functions
    function openDrawer() {
      toolsDrawer.classList.add('open');
      overlay.classList.add('visible');
      document.body.style.overflow = 'hidden';
      const chevron = toolsBtn.querySelector('.chevron-icon');
      if (chevron) {
        chevron.style.transform = 'rotate(180deg)';
        chevron.style.transition = 'transform 0.3s ease';
      }
    }

    function closeDrawer() {
      toolsDrawer.classList.remove('open');
      overlay.classList.remove('visible');
      document.body.style.overflow = '';
      const chevron = toolsBtn.querySelector('.chevron-icon');
      if (chevron) {
        chevron.style.transform = 'rotate(0deg)';
      }
    }

    // Toggle drawer on button click
    toolsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (toolsDrawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    // Close drawer when clicking overlay
    overlay.addEventListener('click', closeDrawer);

    // Close drawer when clicking close button
    const closeBtn = document.getElementById('closeToolsDrawerBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeDrawer);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toolsDrawer.classList.contains('open')) {
        closeDrawer();
      }
    });

    // Prevent drawer from closing when clicking inside content
    toolsDrawer.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // ----- PWA Install Logic (Enhanced) -----
    const installBtn = document.getElementById('drawerInstallBtn');
    let deferredPrompt;

    // 1. Check if app is installed (standalone + legacy iOS)
    function isAppInstalled() {
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.matchMedia('(display-mode: fullscreen)').matches ||
             window.matchMedia('(display-mode: minimal-ui)').matches ||
             navigator.standalone ||
             false;
    }

    // 2. Check if we already recorded an install (persist across pages)
    function wasPreviouslyInstalled() {
      return localStorage.getItem('pwa-installed') === 'true';
    }

    // 3. Should the install button be visible?
    function shouldShowInstallBtn() {
      return !isAppInstalled() && !wasPreviouslyInstalled() && deferredPrompt;
    }

    // 4. Update button visibility based on current state
    function updateInstallBtnVisibility() {
      if (shouldShowInstallBtn()) {
        installBtn.style.display = 'flex';
      } else {
        installBtn.style.display = 'none';
      }
    }

    // 5. Show the native prompt (or manual fallback)
    async function handleInstall() {
      if (deferredPrompt) {
        try {
          // Show the native install prompt
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`Install outcome: ${outcome}`);
          
          if (outcome === 'accepted') {
            // Persist that installation happened
            localStorage.setItem('pwa-installed', 'true');
            installBtn.style.display = 'none';
            
            // Close the drawer after successful install
            closeDrawer();
            
            // Show success message
            const toast = document.getElementById('toast');
            if (toast) {
              toast.textContent = '✅ App installed successfully!';
              toast.classList.remove('hidden');
              setTimeout(() => toast.classList.add('hidden'), 3000);
            }
          }
          
          // Reset the event (only one prompt allowed per session)
          deferredPrompt = null;
          updateInstallBtnVisibility();
        } catch (error) {
          console.error('Install error:', error);
          deferredPrompt = null;
          updateInstallBtnVisibility();
        }
      } else {
        // No prompt available → show instructions
        showInstallInstructions();
      }
    }

    // 6. Platform‑specific manual instructions
    function showInstallInstructions() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      let message = '';

      if (isIOS) {
        message = '📱 Tap the Share button and select "Add to Home Screen"';
      } else if (isAndroid) {
        message = '📱 Tap the menu (⋮) and select "Install app" or "Add to Home Screen"';
      } else {
        message = '💻 Look for the install icon in your browser\'s address bar';
      }

      // Use the global toast if available (created by modal.js)
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 5000);
      } else {
        alert(message);
      }
    }

    // 7. Attach click event to install button
    installBtn.addEventListener('click', handleInstall);

    // 8. Capture the install prompt as soon as it fires
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the default mini-info bar from appearing
      e.preventDefault();
      // Store the event for later use
      deferredPrompt = e;
      // Show the button in the drawer if app isn't installed
      updateInstallBtnVisibility();
      console.log('beforeinstallprompt captured - install button visible in drawer');
    });

    // 9. If the app gets installed by other means (e.g., browser menu)
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed successfully');
      localStorage.setItem('pwa-installed', 'true');
      deferredPrompt = null;
      installBtn.style.display = 'none';
      
      // Show success message
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = '✅ App installed successfully!';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
      }
    });

    // 10. Final check: if prompt never fires but app isn't installed, show button with fallback
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (!isAppInstalled() && !wasPreviouslyInstalled() && !deferredPrompt) {
          // Still allow the button to appear; clicking it will show instructions
          installBtn.style.display = 'flex';
          // Remove previous click handler and replace with instruction-only fallback
          installBtn.removeEventListener('click', handleInstall);
          installBtn.addEventListener('click', () => {
            showInstallInstructions();
          }, { once: true });
          console.log('Fallback: showing install button with manual instructions');
        } else {
          updateInstallBtnVisibility();
        }
      }, 500);
    });

    console.log('Tools drawer initialized with enhanced install button');
  }
})();
