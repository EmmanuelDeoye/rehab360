// js/history-migration.js
// Detects data left over under the OLD top-level Firebase paths
// (patients/{uid}, projects/{uid}, study/{uid}, subjects/{uid}, exam/{uid})
// from before the database was reorganized so everything lives under
// history/{uid}/{type}/... instead. Prompts the user, per relevant page, to
// migrate it — merging into the new location so nothing already saved there
// gets overwritten, then marks that type as migrated so we don't ask again.
//
// Usage: include this script, then set on <body>:
//   <body data-migrate-types="patients">          (doc.html)
//   <body data-migrate-types="projects">          (project.html)
//   <body data-migrate-types="study,subjects">    (study.html)
//   <body data-migrate-types="exam,subjects">     (exam.html)

(function () {
  const OLD_PATH_FOR = {
    patients: 'patients',
    projects: 'projects',
    study: 'study',
    subjects: 'subjects',
    exam: 'exam'
  };
  const LABEL_FOR = {
    patients: 'patient records',
    projects: 'academic projects',
    study: 'study sets',
    subjects: 'study/exam subjects',
    exam: 'exam attempts'
  };

  function db() { return firebase.database(); }

  function typesFromBody() {
    const raw = document.body.getAttribute('data-migrate-types') || '';
    return raw.split(',').map(s => s.trim()).filter(Boolean).filter(t => OLD_PATH_FOR[t]);
  }

  function buildModal(pendingTypes) {
    if (document.getElementById('historyMigrationModal')) return document.getElementById('historyMigrationModal');

    const overlay = document.createElement('div');
    overlay.id = 'historyMigrationModal';
    overlay.className = 'hm-overlay';
    overlay.innerHTML = `
      <div class="hm-box">
        <div class="hm-icon"><i class="fas fa-database"></i></div>
        <h3>We've upgraded how your history is stored</h3>
        <p>We found some ${pendingTypes.map(t => LABEL_FOR[t]).join(', ')} saved under the old storage
        format. Migrate it now so it shows up correctly with everything else — nothing will be deleted
        or lost, and this only takes a moment.</p>
        <div class="hm-actions">
          <button type="button" class="hm-btn hm-btn-secondary" id="hmLaterBtn">Remind Me Later</button>
          <button type="button" class="hm-btn hm-btn-primary" id="hmMigrateBtn"><i class="fas fa-arrow-right-arrow-left"></i> Migrate Now</button>
        </div>
        <div class="hm-status" id="hmStatus" style="display:none;"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  async function migrateType(uid, type) {
    const oldPath = `${OLD_PATH_FOR[type]}/${uid}`;
    const newPath = `history/${uid}/${type}`;

    const oldSnap = await db().ref(oldPath).once('value');
    const oldData = oldSnap.val();

    if (oldData && Object.keys(oldData).length > 0) {
      // Merge (not overwrite) into the new location — Firebase push IDs make
      // key collisions with anything already saved there effectively impossible.
      await db().ref(newPath).update(oldData);
    }

    // Mark migrated + remove the old node so we don't ask again / leave duplicates.
    await db().ref(`users/${uid}/migratedPaths/${type}`).set(true);
    await db().ref(oldPath).remove();
  }

  async function checkAndPrompt(uid) {
    const requestedTypes = typesFromBody();
    if (!requestedTypes.length) return;

    const migratedSnap = await db().ref(`users/${uid}/migratedPaths`).once('value');
    const migrated = migratedSnap.val() || {};

    const pending = [];
    for (const type of requestedTypes) {
      if (migrated[type]) continue;
      const snap = await db().ref(`${OLD_PATH_FOR[type]}/${uid}`).once('value');
      if (snap.exists()) pending.push(type);
      else await db().ref(`users/${uid}/migratedPaths/${type}`).set(true); // nothing to migrate, don't ask again
    }

    if (!pending.length) return;

    const overlay = buildModal(pending);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const laterBtn = document.getElementById('hmLaterBtn');
    const migrateBtn = document.getElementById('hmMigrateBtn');
    const statusEl = document.getElementById('hmStatus');

    laterBtn.addEventListener('click', () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
    });

    migrateBtn.addEventListener('click', async () => {
      migrateBtn.disabled = true;
      laterBtn.disabled = true;
      statusEl.style.display = 'block';
      statusEl.textContent = 'Migrating your data…';
      try {
        for (const type of pending) {
          await migrateType(uid, type);
        }
        statusEl.textContent = '✅ Done! Your history is now up to date.';
        setTimeout(() => {
          overlay.classList.remove('show');
          setTimeout(() => overlay.remove(), 200);
          window.location.reload(); // so the page re-reads from the new path
        }, 1200);
      } catch (err) {
        console.error('History migration failed:', err);
        statusEl.textContent = '⚠️ Something went wrong. Your old data is safe — we\'ll try again next time.';
        migrateBtn.disabled = false;
        laterBtn.disabled = false;
      }
    });
  }

  function init() {
    if (!window.firebase || !firebase.auth) return;
    firebase.auth().onAuthStateChanged((user) => {
      if (user) checkAndPrompt(user.uid).catch(err => console.error('Migration check failed:', err));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
