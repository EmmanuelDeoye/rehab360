// js/formatresult.js - Complete Assessment Result Page with Rich Text Editor
// Enhanced version with public/private sharing toggle, fixed checkboxes, and Android input support

// Theme toggle
(function() {
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  function setTheme(theme) {
    if (theme === 'system') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-theme', dark ? 'dark' : 'light');
    } else {
      html.setAttribute('data-theme', theme);
    }
  }
  function initTheme() {
    const stored = localStorage.getItem('rehab-theme');
    setTheme(stored || 'system');
  }
  function cycleTheme() {
    const current = html.getAttribute('data-theme');
    let newTheme = 'light';
    if (current === 'light') newTheme = 'dark';
    else if (current === 'dark') newTheme = 'system';
    else newTheme = 'light';
    localStorage.setItem('rehab-theme', newTheme);
    setTheme(newTheme);
  }
  if (themeToggle) themeToggle.addEventListener('click', cycleTheme);
  initTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('rehab-theme') === 'system') setTheme('system');
  });
})();

// Toast notification function
function showToast(message, isError = false, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.style.background = isError ? '#dc2626' : 'var(--accent)';
  setTimeout(() => toast.classList.add('hidden'), duration);
}

// Global variables
let currentUser = null;
let currentAssessmentId = null;
let currentAssessmentText = '';
let currentAssessmentData = null;
let editor = null;
let editorInitialized = false;
let currentIsOwner = false;
let currentAssessmentOwnerId = null;

// Get assessment ID from URL
const urlParams = new URLSearchParams(window.location.search);
const assessmentId = urlParams.get('id');

// Wait for TinyMCE to load before initializing
function waitForTinyMCE() {
  return new Promise((resolve) => {
    if (typeof tinymce !== 'undefined') {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (typeof tinymce !== 'undefined') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        console.error('TinyMCE failed to load');
        resolve();
      }, 10000);
    }
  });
}

// Initialize TinyMCE
async function initEditor() {
  try {
    await waitForTinyMCE();
    
    if (typeof tinymce === 'undefined') {
      console.error('TinyMCE not available');
      showToast('Editor not available. Please refresh the page.', true);
      return;
    }
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    tinymce.init({
      selector: '#editor',
      height: 600,
      menubar: true,
      plugins: [
        'advlist', 'autolink', 'lists', 'link', 'charmap', 'print',
        'preview', 'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
        'insertdatetime', 'media', 'table', 'help', 'wordcount'
      ],
      toolbar: 'undo redo | blocks | ' +
        'bold italic underline | forecolor backcolor | ' +
        'alignleft aligncenter alignright alignjustify | ' +
        'bullist numlist outdent indent | ' +
        'table | removeformat | help',
      toolbar_mode: 'sliding',
      content_style: `
        body { 
          font-family: 'Arial', 'Helvetica', sans-serif; 
          font-size: 14px; 
          line-height: 1.6;
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        h1 { color: #00695c; font-size: 24px; margin-top: 20px; border-bottom: 2px solid #00695c; }
        h2 { color: #00897b; font-size: 20px; margin-top: 18px; }
        h3 { color: #009688; font-size: 18px; margin-top: 15px; }
        table { border-collapse: collapse; width: 100%; margin: 15px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
        ul, ol { margin: 10px 0; padding-left: 30px; }
        strong { color: #00695c; }
      `,
      skin: isDark ? 'oxide-dark' : 'oxide',
      content_css: isDark ? 'dark' : 'default',
      setup: function(ed) {
        editor = ed;
        editorInitialized = true;
        
        // Save on Ctrl+S
        ed.addShortcut('Ctrl+S', 'Save', function() {
          saveChanges();
        });
        
        // Handle editor content changes
        ed.on('change', function() {
          console.log('Content changed');
        });
        
        ed.on('init', function() {
          if (window.pendingContent) {
            ed.setContent(window.pendingContent);
            delete window.pendingContent;
          }
          
          // Set read-only mode if not owner
          if (!currentIsOwner && currentAssessmentId) {
            ed.mode.set('readonly');
            if (currentAssessmentData && currentAssessmentData.ownerId !== currentUser?.uid) {
              showToast('You are viewing a shared assessment (read-only).', false, 4000);
            }
          }
        });
      }
    });
  } catch (error) {
    console.error('Failed to initialize editor:', error);
    showToast('Failed to initialize editor. Please refresh the page.', true);
  }
}

// Show/hide public toggle for owner only
function updatePublicToggleVisibility() {
  const container = document.getElementById('publicToggleContainer');
  const toggle = document.getElementById('publicToggle');
  if (!container || !toggle) return;

  if (currentIsOwner && currentAssessmentData) {
    container.style.display = 'flex';
    toggle.checked = currentAssessmentData.isPublic === true;
  } else {
    container.style.display = 'none';
  }
}

// Toggle public/private status
async function togglePublic(event) {
  const isChecked = event.target.checked;
  if (!currentUser || !currentAssessmentId || !currentIsOwner) {
    showToast('You are not the owner of this assessment.', true);
    event.target.checked = !isChecked;
    return;
  }

  try {
    const updates = {
      isPublic: isChecked,
      lastModified: new Date().toISOString()
    };
    await firebase.database().ref(`history/${currentUser.uid}/formats/${currentAssessmentId}`).update(updates);
    currentAssessmentData.isPublic = isChecked;

    if (isChecked) {
      // Create a public copy
      const publicData = { 
        ...currentAssessmentData, 
        ownerId: currentUser.uid,
        lastModified: new Date().toISOString()
      };
      await firebase.database().ref(`publicAssessments/${currentAssessmentId}`).set(publicData);
      showToast('✅ Assessment is now public. Anyone with the link can view it.', false, 4000);
    } else {
      // Remove public copy
      await firebase.database().ref(`publicAssessments/${currentAssessmentId}`).remove();
      showToast('🔒 Assessment is now private.', false, 4000);
    }
  } catch (error) {
    console.error('Error toggling public status:', error);
    showToast('Failed to update sharing setting', true);
    event.target.checked = !isChecked; // revert
  }
}

// Load assessment from Firebase with public/private support
async function loadAssessmentFromFirebase(id) {
  try {
    // Check if Firebase is available
    if (typeof firebase === 'undefined' || !firebase.database) {
      console.error('Firebase not available');
      showToast('Firebase not available. Please check your connection.', true);
      return;
    }
    
    let data = null;
    let ownerId = null;
    let isPublicCopy = false;

    // First, try to load from current user's history (if logged in)
    if (currentUser) {
      const snapshot = await firebase.database().ref(`history/${currentUser.uid}/formats/${id}`).once('value');
      data = snapshot.val();
      if (data) {
        ownerId = currentUser.uid;
        currentIsOwner = true;
        console.log('Loaded from owner history');
      }
    }

    // If not found and not owner, try public path
    if (!data) {
      const publicSnapshot = await firebase.database().ref(`publicAssessments/${id}`).once('value');
      data = publicSnapshot.val();
      if (data) {
        ownerId = data.ownerId;
        currentIsOwner = currentUser && currentUser.uid === ownerId;
        isPublicCopy = true;
        console.log('Loaded from public assessments');
      }
    }

    if (!data) {
      const outputDiv = document.getElementById('assessmentOutput');
      if (outputDiv) {
        outputDiv.innerHTML = '<p style="color: #dc2626; text-align: center;">❌ Assessment not found or it is private.</p>';
        outputDiv.style.display = 'block';
      }
      const editorContainer = document.querySelector('.editor-container');
      if (editorContainer) editorContainer.style.display = 'none';
      showToast('Assessment not found or access denied', true);
      return;
    }

    // Store data
    currentAssessmentData = data;
    currentAssessmentText = data.generatedText || '';
    currentAssessmentId = id;
    currentAssessmentOwnerId = ownerId || data.ownerId;

    // Update UI with assessment data
    updateUIWithData(data);
    updatePublicToggleVisibility(); // Show/hide toggle based on ownership
    
    // Show editor container
    const editorContainer = document.querySelector('.editor-container');
    if (editorContainer) editorContainer.style.display = 'block';
    const outputDiv = document.getElementById('assessmentOutput');
    if (outputDiv) outputDiv.style.display = 'none';
    
    // Load content into editor if ready, otherwise queue it
    if (editor && editorInitialized) {
      editor.setContent(currentAssessmentText);
      // Set read-only mode if not owner
      if (!currentIsOwner) {
        editor.mode.set('readonly');
        showToast('📖 You are viewing a shared assessment (read-only).', false, 4000);
      } else {
        editor.mode.set('design');
      }
    } else {
      window.pendingContent = currentAssessmentText;
    }
    
    // Show sharing status for non-owners
    if (!currentIsOwner && data.isPublic) {
      showToast(`🔗 Shared assessment from ${data.patientName || 'another user'}`, false, 3000);
    }
    
  } catch (error) {
    console.error('Error loading assessment:', error);
    const outputDiv = document.getElementById('assessmentOutput');
    if (outputDiv) {
      outputDiv.innerHTML = '<p style="color: #dc2626; text-align: center;">❌ Error loading assessment</p>';
      outputDiv.style.display = 'block';
    }
    showToast('Failed to load assessment', true);
  }
}

// Update UI with assessment data
function updateUIWithData(data) {
  // Update title
  const titleElement = document.getElementById('resultTitle');
  if (titleElement) {
    titleElement.textContent = `Assessment: ${data.patientName || 'Result'}`;
  }
  
  // Update print date
  const printDateElement = document.getElementById('printDate');
  if (printDateElement && data.timestamp) {
    printDateElement.textContent = new Date(data.timestamp).toLocaleString();
  }
  
  // Update badges
  const patientNameBadge = document.getElementById('patientNameBadge');
  if (patientNameBadge) {
    patientNameBadge.textContent = `👤 ${data.patientName || 'Unknown'}`;
  }
  
  const assessmentTypeBadge = document.getElementById('assessmentTypeBadge');
  if (assessmentTypeBadge) {
    assessmentTypeBadge.textContent = `📋 ${data.assessmentType || 'Assessment'}`;
  }
  
  const departmentBadge = document.getElementById('departmentBadge');
  if (departmentBadge) {
    departmentBadge.textContent = `🏥 ${data.department || 'General'}`;
  }
  
  // Update age and gender if available
  if (data.patientAge && data.patientGender) {
    let ageGenderBadge = document.getElementById('ageGenderBadge');
    if (!ageGenderBadge) {
      ageGenderBadge = document.createElement('span');
      ageGenderBadge.className = 'badge';
      ageGenderBadge.id = 'ageGenderBadge';
      const badgesContainer = document.getElementById('resultBadges');
      if (badgesContainer) {
        badgesContainer.appendChild(ageGenderBadge);
      }
    }
    ageGenderBadge.textContent = `🎂 ${data.patientAge} yrs • ${data.patientGender}`;
  }
  
  // Update diagnosis if available
  if (data.diagnosis) {
    let diagnosisBadge = document.getElementById('diagnosisBadge');
    if (!diagnosisBadge) {
      diagnosisBadge = document.createElement('span');
      diagnosisBadge.className = 'badge';
      diagnosisBadge.id = 'diagnosisBadge';
      const badgesContainer = document.getElementById('resultBadges');
      if (badgesContainer) {
        badgesContainer.appendChild(diagnosisBadge);
      }
    }
    diagnosisBadge.textContent = `🩺 ${data.diagnosis}`;
  }
  
  // Add public badge if applicable
  if (data.isPublic) {
    let publicBadge = document.getElementById('publicBadge');
    if (!publicBadge) {
      publicBadge = document.createElement('span');
      publicBadge.className = 'badge public-badge';
      publicBadge.id = 'publicBadge';
      const badgesContainer = document.getElementById('resultBadges');
      if (badgesContainer) {
        badgesContainer.appendChild(publicBadge);
      }
    }
    publicBadge.textContent = `🌍 Public`;
  } else {
    const publicBadge = document.getElementById('publicBadge');
    if (publicBadge) publicBadge.remove();
  }
}

// Save changes to Firebase with public copy sync
async function saveChanges() {
  if (!currentUser) {
    showToast('Please login to save changes', true);
    return;
  }
  
  if (!currentIsOwner) {
    showToast('You cannot edit a shared assessment. Only the owner can make changes.', true);
    return;
  }
  
  if (!currentAssessmentId || !editor || !editorInitialized) {
    showToast('Cannot save: No assessment loaded or editor not ready', true);
    return;
  }
  
  const updatedHtml = editor.getContent();
  
  try {
    // Update in Firebase
    const updates = {
      generatedText: updatedHtml,
      preview: updatedHtml.replace(/<[^>]*>/g, ' ').substring(0, 150).replace(/\n/g, ' '),
      lastModified: new Date().toISOString()
    };
    
    await firebase.database().ref(`history/${currentUser.uid}/formats/${currentAssessmentId}`).update(updates);
    
    // Update local data
    currentAssessmentText = updatedHtml;
    if (currentAssessmentData) {
      currentAssessmentData.generatedText = updatedHtml;
      currentAssessmentData.lastModified = new Date().toISOString();
    }
    
    // If public, update the public copy
    if (currentAssessmentData && currentAssessmentData.isPublic) {
      const publicData = { 
        ...currentAssessmentData, 
        ownerId: currentUser.uid,
        lastModified: new Date().toISOString()
      };
      await firebase.database().ref(`publicAssessments/${currentAssessmentId}`).set(publicData);
    }
    
    // Show success modal
    const saveModal = document.getElementById('saveConfirmModal');
    if (saveModal) {
      saveModal.classList.add('show');
      setTimeout(() => {
        saveModal.classList.remove('show');
      }, 2000);
    }
    
    showToast('✅ Changes saved successfully!');
    
  } catch (error) {
    console.error('Error saving changes:', error);
    showToast('Failed to save changes', true);
  }
}

// Copy to clipboard
function copyToClipboard() {
  if (!editor || !editorInitialized) {
    showToast('Editor not ready', true);
    return;
  }
  
  const content = editor.getContent();
  const plainText = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  
  navigator.clipboard.writeText(plainText).then(() => {
    showToast('📋 Copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy', true);
  });
}

// Generate filename
function generateFilename(ext) {
  if (currentAssessmentData?.patientName) {
    const name = currentAssessmentData.patientName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 30);
    return `assessment_${name}_${new Date().toISOString().slice(0,10)}.${ext}`;
  }
  return `assessment_${new Date().toISOString().slice(0,10)}.${ext}`;
}

// Download as Word document (.doc) - Simple HTML with .doc extension
function downloadAsWord() {
  if (!editor || !editorInitialized) {
    showToast('Editor not ready', true);
    return;
  }
  
  const htmlContent = editor.getContent();
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Assessment - ${currentAssessmentData?.patientName || 'Result'}</title>
  <style>
    body { font-family: 'Arial', 'Helvetica', sans-serif; line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto; }
    h1 { color: #00695c; border-bottom: 2px solid #00695c; }
    h2 { color: #00897b; }
    h3 { color: #009688; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    @media print {
      body { padding: 0.5in; }
    }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 2rem;">
    <h1>rehab.ai Assessment</h1>
    <p>Patient: ${currentAssessmentData?.patientName || 'N/A'}</p>
    <p>Assessment Type: ${currentAssessmentData?.assessmentType || 'N/A'}</p>
    <p>Department: ${currentAssessmentData?.department || 'N/A'}</p>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <hr>
  </div>
  ${htmlContent}
  <hr>
  <p style="font-size: 0.8rem; color: #666;">Generated by rehab.ai - Intelligent Rehabilitation Tools</p>
</body>
</html>`;
  
  const blob = new Blob([fullHtml], { type: 'application/msword' });
  saveAs(blob, generateFilename('doc'));
  showToast('📄 Word document saved!');
}

// Download as HTML
function downloadAsHtml() {
  if (!editor || !editorInitialized) {
    showToast('Editor not ready', true);
    return;
  }
  
  const htmlContent = editor.getContent();
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Assessment - ${currentAssessmentData?.patientName || 'Result'}</title>
  <style>
    body { font-family: 'Arial', 'Helvetica', sans-serif; line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto; }
    h1 { color: #00695c; }
    h2 { color: #00897b; }
    h3 { color: #009688; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
  </style>
</head>
<body>
  ${htmlContent}
  <hr>
  <p style="font-size: 0.8rem; color: #666;">Generated by rehab.ai on ${new Date().toLocaleString()}</p>
</body>
</html>`;
  
  const blob = new Blob([fullHtml], { type: 'text/html' });
  saveAs(blob, generateFilename('html'));
  showToast('🌐 HTML document saved!');
}

// Download as Plain Text
function downloadAsTxt() {
  if (!editor || !editorInitialized) {
    showToast('Editor not ready', true);
    return;
  }
  
  const htmlContent = editor.getContent();
  const plainText = htmlContent.replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const header = `rehab.ai Assessment\nGenerated: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
  const blob = new Blob([header + plainText], { type: 'text/plain' });
  saveAs(blob, generateFilename('txt'));
  showToast('📝 Text file saved!');
}

// Print functionality
function printAssessment() {
  if (!editor || !editorInitialized) {
    showToast('Editor not ready', true);
    return;
  }
  
  const htmlContent = editor.getContent();
  const printWindow = window.open('', '_blank');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Assessment - ${currentAssessmentData?.patientName || 'Result'}</title>
      <style>
        body { 
          font-family: 'Arial', 'Helvetica', sans-serif; 
          line-height: 1.6; 
          padding: 0.5in;
          max-width: 100%;
          color: ${isDark ? '#eef2f6' : '#333'};
          background: ${isDark ? '#1e2a32' : 'white'};
        }
        h1 { color: #00695c; border-bottom: 2px solid #00695c; }
        h2 { color: #00897b; }
        h3 { color: #009688; }
        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background-color: ${isDark ? '#2e3b45' : '#f5f5f5'}; }
        @media print {
          body { padding: 0.2in; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div style="text-align: center; margin-bottom: 2rem;">
        <h1>rehab.ai Assessment</h1>
        <p>Patient: ${currentAssessmentData?.patientName || 'N/A'}</p>
        <p>Assessment Type: ${currentAssessmentData?.assessmentType || 'N/A'}</p>
        <p>Department: ${currentAssessmentData?.department || 'N/A'}</p>
        <p>Date: ${new Date().toLocaleString()}</p>
        <hr>
      </div>
      ${htmlContent}
      <hr>
      <p style="font-size: 0.8rem; color: #666;">Generated by rehab.ai - Intelligent Rehabilitation Tools</p>
    </body>
    </html>
  `);
  
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

// Share functionality
function shareAssessment() {
  if (!currentAssessmentId) {
    showToast('This assessment cannot be shared yet. Please save it first.', true);
    return;
  }
  
  const shareableUrl = `${window.location.origin}${window.location.pathname}?id=${currentAssessmentId}`;
  const shareLink = document.getElementById('shareLink');
  if (shareLink) {
    shareLink.value = shareableUrl;
  }
  const shareModal = document.getElementById('shareModal');
  if (shareModal) {
    shareModal.classList.add('show');
  }
}

// Initialize Firebase and load data
document.addEventListener('DOMContentLoaded', async () => {
  // Check if Firebase is available
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (user) => {
      currentUser = user;
      
      // Initialize editor after auth
      await initEditor();
      
      if (assessmentId) {
        await loadAssessmentFromFirebase(assessmentId);
      } else {
        // Fallback to sessionStorage
        const storedText = sessionStorage.getItem('currentAssessmentText');
        const storedData = sessionStorage.getItem('currentAssessmentData');
        
        if (storedText) {
          currentAssessmentText = storedText;
          if (storedData) {
            currentAssessmentData = JSON.parse(storedData);
            updateUIWithData(currentAssessmentData);
          }
          
          if (editor && editorInitialized) {
            editor.setContent(storedText);
          } else {
            window.pendingContent = storedText;
          }
        } else {
          showToast('No assessment found. Please generate one first.', true);
          const outputDiv = document.getElementById('assessmentOutput');
          if (outputDiv) {
            outputDiv.innerHTML = '<p style="color: #dc2626; text-align: center;">No assessment found. Please generate one first.</p>';
            outputDiv.style.display = 'block';
          }
          const editorContainer = document.querySelector('.editor-container');
          if (editorContainer) editorContainer.style.display = 'none';
        }
      }
    });
  } else {
    console.error('Firebase not initialized');
    showToast('Firebase not available. Please check your connection.', true);
    // Still try to initialize editor
    await initEditor();
  }
});

// Event listeners (wait for DOM to load)
document.addEventListener('DOMContentLoaded', () => {
  // Copy button
  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyToClipboard);
  }
  
  // Save button
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveChanges);
  }
  
  // Print button
  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', printAssessment);
  }
  
  // Share button
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', shareAssessment);
  }
  
  // Public toggle button
  const publicToggle = document.getElementById('publicToggle');
  if (publicToggle) {
    publicToggle.addEventListener('change', togglePublic);
  }
  
  // Download button - show modal
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadModal = document.getElementById('downloadModal');
  if (downloadBtn && downloadModal) {
    downloadBtn.addEventListener('click', () => {
      downloadModal.classList.add('show');
    });
  }
  
  // Download options
  const downloadWordOption = document.getElementById('downloadWordOption');
  if (downloadWordOption) {
    downloadWordOption.addEventListener('click', () => {
      const modal = document.getElementById('downloadModal');
      if (modal) modal.classList.remove('show');
      downloadAsWord();
    });
  }
  
  const downloadHtmlOption = document.getElementById('downloadHtmlOption');
  if (downloadHtmlOption) {
    downloadHtmlOption.addEventListener('click', () => {
      const modal = document.getElementById('downloadModal');
      if (modal) modal.classList.remove('show');
      downloadAsHtml();
    });
  }
  
  const downloadTxtOption = document.getElementById('downloadTxtOption');
  if (downloadTxtOption) {
    downloadTxtOption.addEventListener('click', () => {
      const modal = document.getElementById('downloadModal');
      if (modal) modal.classList.remove('show');
      downloadAsTxt();
    });
  }
  
  // Cancel download
  const cancelDownload = document.getElementById('cancelDownload');
  if (cancelDownload) {
    cancelDownload.addEventListener('click', () => {
      const modal = document.getElementById('downloadModal');
      if (modal) modal.classList.remove('show');
    });
  }
  
  // Close modals on outside click
  const modals = ['downloadModal', 'shareModal', 'saveConfirmModal'];
  modals.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('show');
        }
      });
    }
  });
  
  // Close share modal
  const closeShareModal = document.getElementById('closeShareModal');
  if (closeShareModal) {
    closeShareModal.addEventListener('click', () => {
      const modal = document.getElementById('shareModal');
      if (modal) modal.classList.remove('show');
    });
  }
  
  // Copy share link
  const copyShareLink = document.getElementById('copyShareLink');
  if (copyShareLink) {
    copyShareLink.addEventListener('click', () => {
      const shareLink = document.getElementById('shareLink');
      if (shareLink) {
        shareLink.select();
        navigator.clipboard.writeText(shareLink.value).then(() => {
          showToast('🔗 Link copied to clipboard!');
        });
      }
    });
  }
  
  // Close save modal
  const closeSaveModal = document.getElementById('closeSaveModal');
  if (closeSaveModal) {
    closeSaveModal.addEventListener('click', () => {
      const modal = document.getElementById('saveConfirmModal');
      if (modal) modal.classList.remove('show');
    });
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (currentIsOwner) {
        saveChanges();
      } else {
        showToast('Read-only mode: cannot save changes', false, 2000);
      }
    }
    // Escape to close modals
    if (e.key === 'Escape') {
      const downloadModal = document.getElementById('downloadModal');
      const shareModal = document.getElementById('shareModal');
      const saveModal = document.getElementById('saveConfirmModal');
      if (downloadModal && downloadModal.classList.contains('show')) downloadModal.classList.remove('show');
      if (shareModal && shareModal.classList.contains('show')) shareModal.classList.remove('show');
      if (saveModal && saveModal.classList.contains('show')) saveModal.classList.remove('show');
    }
    // Ctrl+P to print
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      printAssessment();
    }
  });
  
  // Android input focus fix - ensure all inputs are focusable
  const allInputs = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
  allInputs.forEach(input => {
    input.addEventListener('touchstart', function(e) {
      // Allow touch to focus inputs on Android
      this.focus();
    });
  });
});

console.log('formatresult.js loaded with rich text editor support, public/private sharing, and mobile fixes');
