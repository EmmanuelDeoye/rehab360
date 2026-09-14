// js/center.js
// Shared "Center / Organization" logic used by settings.html, admin.html,
// index.html, and any tool page that wants to (a) respect a center owner's
// per-member access toggles, (b) log member activity, and (c) let a user
// belong to several centers (as a consenting member) while also possibly
// owning their own center — switching between "workspaces" at will.
//
// Data model (Firebase Realtime Database):
//   users/{uid}.accountType         = 'individual' | 'center'   (whether THIS uid owns a center)
//   users/{uid}.centerId            = uid of the center this user OWNS (owners only)
//   users/{uid}.activeContext       = 'individual' | centerUid  (which workspace they're currently using)
//   users/{uid}.memberships/{centerUid} = { centerName, status: 'invited'|'active'|'declined'|'revoked', invitedAt, respondedAt }
//     — a user can have MANY of these (member of several centers), independent of owning one themselves.
//
//   users/{centerUid}/centers                       = { name, ownerUid, ownerEmail, createdAt, slug, slugUpdatedAt }
//   users/{centerUid}/centers/members/{memberUid}   = { email, name, status: 'invited'|'active'|'declined'|'revoked', permissions: {tool: bool}, addedAt, respondedAt }
//   users/{centerUid}/centers/pendingInvites/{key}  = { email, permissions, invitedAt }  (key = sanitized email, for people without a rehablix account yet)
//   users/{centerUid}/centers/activity/{pushId}     = { uid, email, name, page, action, detail, timestamp }
//
// A membership always starts as 'invited' — nobody is added to a center
// without explicitly accepting (see respondToInvite / the invite modal in
// js/invite-modal.js).

(function () {
  const TOOL_KEYS = ['doc', 'presentation', 'rom', 'project', 'standardized', 'exam', 'study', 'assignment', 'ppt', 'audio'];

  function sanitizeEmailKey(email) {
    return (email || '').trim().toLowerCase().replace(/[.#$/\[\]]/g, '_');
  }

  function db() {
    return firebase.database();
  }

  // Resolve the current user's FULL center picture: what they own, every
  // center they're a member of (with status), and which "workspace" is
  // currently active — plus permission details for that active workspace.
  async function getContext() {
    const user = firebase.auth().currentUser;
    if (!user) return { loggedIn: false };

    const userSnap = await db().ref('users/' + user.uid).once('value');
    const userData = userSnap.val() || {};

    const isCenterOwner = userData.accountType === 'center';
    const ownCenterId = isCenterOwner ? user.uid : null;
    const memberships = userData.memberships || {};

    const activeMemberships = Object.keys(memberships).filter(cid => memberships[cid].status === 'active');
    const pendingInvites = Object.keys(memberships)
      .filter(cid => memberships[cid].status === 'invited')
      .map(cid => ({ centerUid: cid, ...memberships[cid] }));

    const validContexts = ['individual'].concat(ownCenterId ? [ownCenterId] : []).concat(activeMemberships);
    let activeContext = userData.activeContext || 'individual';
    if (!validContexts.includes(activeContext)) activeContext = 'individual';

    const ctx = {
      loggedIn: true,
      uid: user.uid,
      email: user.email,
      name: userData.name || user.displayName || user.email,
      accountType: userData.accountType || 'individual',
      isCenterOwner,
      ownCenterId,
      memberships,
      activeMemberships,
      pendingInvites,
      activeContext,
      isActiveContextCenter: activeContext !== 'individual',
      centerId: activeContext !== 'individual' ? activeContext : null,
      permissions: null,
      memberStatus: null
    };

    if (ctx.centerId) {
      if (ctx.centerId === ownCenterId) {
        ctx.memberStatus = 'active'; // owner always has full access to their own center
        ctx.permissions = null;
      } else {
        const memberSnap = await db().ref(`users/${ctx.centerId}/centers/members/${user.uid}`).once('value');
        const memberData = memberSnap.val() || {};
        ctx.memberStatus = memberData.status || null;
        ctx.permissions = memberData.permissions || {};
      }
      const centerSnap = await db().ref(`users/${ctx.centerId}/centers`).once('value');
      ctx.activeCenterName = (centerSnap.val() || {}).name || '';
    }

    return ctx;
  }

  // All the "workspaces" available to switch between, for the navbar switcher.
  async function getAvailableContexts() {
    const ctx = await getContext();
    if (!ctx.loggedIn) return [];
    const options = [{ id: 'individual', label: 'Personal Account', type: 'individual' }];
    if (ctx.ownCenterId) {
      const centerSnap = await db().ref(`users/${ctx.ownCenterId}/centers`).once('value');
      options.push({ id: ctx.ownCenterId, label: (centerSnap.val() || {}).name || 'My Center', type: 'owner' });
    }
    for (const cid of ctx.activeMemberships) {
      const centerSnap = await db().ref(`users/${cid}/centers`).once('value');
      options.push({ id: cid, label: (centerSnap.val() || {}).name || 'Center', type: 'member' });
    }
    return options;
  }

  async function switchActiveContext(contextId) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not logged in.');
    const available = await getAvailableContexts();
    if (!available.some(c => c.id === contextId)) throw new Error('You don\'t have access to that workspace.');
    await db().ref('users/' + user.uid + '/activeContext').set(contextId);
  }

  // Convert an existing individual account into a center, from settings.html.
  // Does not touch any memberships the user already has elsewhere.
  async function convertToCenter(orgName) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not logged in.');
    if (!orgName || !orgName.trim()) throw new Error('Organization name is required.');

    await db().ref('users/' + user.uid + '/centers').set({
      name: orgName.trim(),
      ownerUid: user.uid,
      ownerEmail: user.email,
      createdAt: new Date().toISOString()
    });

    await db().ref('users/' + user.uid).update({
      accountType: 'center',
      centerId: user.uid
    });

    return user.uid;
  }

  // Invite a member by email. This only ever creates an 'invited' status —
  // the person must explicitly accept (via respondToInvite) before they get
  // any access or their data is scoped to the center. If they already have
  // a rehablix account, the invite links immediately as 'invited'; otherwise
  // it's stored and auto-linked (still as 'invited') the moment they sign up.
  async function inviteMember(centerUid, email, permissions) {
    if (!email) throw new Error('Email is required.');
    const cleanEmail = email.trim().toLowerCase();
    const perms = permissions || TOOL_KEYS.reduce((acc, k) => (acc[k] = true, acc), {});

    const centerSnap = await db().ref(`users/${centerUid}/centers`).once('value');
    const centerName = (centerSnap.val() || {}).name || 'a center';

    const usersSnap = await db().ref('users').orderByChild('email').equalTo(cleanEmail).once('value');
    const usersVal = usersSnap.val();

    if (usersVal) {
      const memberUid = Object.keys(usersVal)[0];
      const memberData = usersVal[memberUid];

      if (memberUid === centerUid) throw new Error("You can't invite yourself.");
      if (memberData.memberships && memberData.memberships[centerUid] && memberData.memberships[centerUid].status === 'active') {
        throw new Error('This person is already a member of your center.');
      }

      const invitedAt = new Date().toISOString();
      await db().ref(`users/${centerUid}/centers/members/${memberUid}`).set({
        email: cleanEmail,
        name: memberData.name || cleanEmail,
        status: 'invited',
        permissions: perms,
        addedAt: invitedAt
      });
      await db().ref(`users/${memberUid}/memberships/${centerUid}`).set({
        centerName,
        status: 'invited',
        invitedAt
      });
      return { linked: true, memberUid };
    }

    // No account yet — store a pending invite keyed by sanitized email.
    await db().ref(`users/${centerUid}/centers/pendingInvites/${sanitizeEmailKey(cleanEmail)}`).set({
      email: cleanEmail,
      permissions: perms,
      invitedAt: new Date().toISOString()
    });
    return { linked: false };
  }

  // Called on login/registration (from auth.js) to auto-link a pending invite
  // if this user's email matches one, across ALL centers — still landing as
  // 'invited', never auto-activated, so consent is always required.
  async function linkPendingInviteForUser(uid, email, name) {
    if (!email) return;
    const key = sanitizeEmailKey(email);
    const usersSnap = await db().ref('users').once('value');
    const users = usersSnap.val() || {};

    for (const centerUid of Object.keys(users)) {
      const center = users[centerUid].centers;
      const invite = center && center.pendingInvites && center.pendingInvites[key];
      if (invite) {
        const invitedAt = new Date().toISOString();
        await db().ref(`users/${centerUid}/centers/members/${uid}`).set({
          email: email.toLowerCase(),
          name: name || email,
          status: 'invited',
          permissions: invite.permissions || {},
          addedAt: invitedAt
        });
        await db().ref(`users/${uid}/memberships/${centerUid}`).set({
          centerName: center.name || 'a center',
          status: 'invited',
          invitedAt
        });
        await db().ref(`users/${centerUid}/centers/pendingInvites/${key}`).remove();
      }
    }
  }

  // The invited user accepts or declines. Updates both sides of the
  // relationship (the center's member record and the user's own
  // memberships map) so each can be read independently and cheaply.
  async function respondToInvite(centerUid, accept) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not logged in.');

    const status = accept ? 'active' : 'declined';
    const respondedAt = new Date().toISOString();

    await db().ref(`users/${centerUid}/centers/members/${user.uid}`).update({ status, respondedAt });
    await db().ref(`users/${user.uid}/memberships/${centerUid}`).update({ status, respondedAt });

    if (accept) {
      // Make the newly-accepted center their active workspace right away.
      await db().ref('users/' + user.uid + '/activeContext').set(centerUid);
    }
  }

  // Pending invites for the current user — drives the popup modal + the
  // "respond later" list on settings.html.
  async function getPendingInvites() {
    const ctx = await getContext();
    if (!ctx.loggedIn) return [];
    return ctx.pendingInvites;
  }

  // Toggle a specific tool's access on/off for a member, "at will", by the center owner.
  async function setMemberPermission(centerUid, memberUid, toolKey, enabled) {
    await db().ref(`users/${centerUid}/centers/members/${memberUid}/permissions/${toolKey}`).set(!!enabled);
  }

  // Fully revoke / restore a member's access to the center.
  async function setMemberStatus(centerUid, memberUid, status) {
    await db().ref(`users/${centerUid}/centers/members/${memberUid}/status`).set(status);
    await db().ref(`users/${memberUid}/memberships/${centerUid}/status`).set(status);
  }

  async function removeMember(centerUid, memberUid) {
    await db().ref(`users/${centerUid}/centers/members/${memberUid}`).remove();
    await db().ref(`users/${memberUid}/memberships/${centerUid}`).remove();
    // If that was their active workspace, drop them back to their personal account.
    const activeSnap = await db().ref('users/' + memberUid + '/activeContext').once('value');
    if (activeSnap.val() === centerUid) {
      await db().ref('users/' + memberUid + '/activeContext').set('individual');
    }
  }

  // Check whether the current user is allowed to use a given tool page,
  // based on whichever workspace (activeContext) they're currently in.
  async function checkAccess(toolKey) {
    const ctx = await getContext();
    if (!ctx.loggedIn) return true; // let the page's own auth-gate logic handle logged-out state
    if (!ctx.isActiveContextCenter) return true; // personal workspace, or owns the active center
    if (ctx.centerId === ctx.ownCenterId) return true; // owner, full access
    if (ctx.memberStatus !== 'active') return false;
    if (ctx.permissions && ctx.permissions[toolKey] === false) return false;
    return true;
  }

  // One-time, silent migration of legacy top-level centers/{uid} data (from
  // before centers were nested under users/{uid}/centers) — no user prompt
  // needed since this is just an internal restructuring of the owner's own data.
  async function migrateLegacyCenterNode(uid) {
    try {
      const alreadyNested = await db().ref(`users/${uid}/centers`).once('value');
      if (alreadyNested.exists()) return; // already on the new structure

      const legacySnap = await db().ref('centers/' + uid).once('value');
      const legacyData = legacySnap.val();
      if (!legacyData) return; // nothing to migrate

      await db().ref(`users/${uid}/centers`).set(legacyData);
      await db().ref('centers/' + uid).remove();
      console.log('[center.js] Migrated legacy centers/' + uid + ' to users/' + uid + '/centers');
    } catch (err) {
      console.warn('[center.js] Legacy center migration skipped:', err);
    }
  }

  // One-time, silent migration from the old single users/{uid}.memberOf
  // string to the new memberships map. Anyone already linked under the old
  // system is grandfathered in as 'active' (they already had access before
  // this consent requirement existed), rather than being force-unlinked.
  async function migrateLegacyMembership(uid) {
    try {
      const snap = await db().ref('users/' + uid + '/memberOf').once('value');
      const legacyCenterUid = snap.val();
      if (!legacyCenterUid) return;

      const centerSnap = await db().ref(`users/${legacyCenterUid}/centers`).once('value');
      const centerName = (centerSnap.val() || {}).name || 'a center';

      await db().ref(`users/${uid}/memberships/${legacyCenterUid}`).set({
        centerName,
        status: 'active',
        invitedAt: new Date().toISOString(),
        respondedAt: new Date().toISOString(),
        migratedFromLegacy: true
      });
      await db().ref(`users/${legacyCenterUid}/centers/members/${uid}/status`).set('active');

      const activeSnap = await db().ref('users/' + uid + '/activeContext').once('value');
      if (!activeSnap.exists()) {
        await db().ref('users/' + uid + '/activeContext').set(legacyCenterUid);
      }

      await db().ref('users/' + uid + '/memberOf').remove();
      console.log('[center.js] Migrated legacy memberOf for', uid);
    } catch (err) {
      console.warn('[center.js] Legacy membership migration skipped:', err);
    }
  }

  // Which uid's data should this tool page actually read/write?
  // - Personal workspace, or the workspace of a center you OWN: your own uid.
  // - The workspace of a center you're an ACTIVE member of: the owner's uid,
  //   so everyone on the team sees and edits the SAME patients/records.
  // Returns null if access to this specific tool has been revoked/declined —
  // callers should treat that as "no access" and show an appropriate message.
  async function getEffectiveScopeUid(toolKey) {
    const ctx = await getContext();
    if (!ctx.loggedIn) return null;
    if (!ctx.isActiveContextCenter) return ctx.uid;
    if (ctx.centerId === ctx.ownCenterId) return ctx.uid;
    if (ctx.memberStatus !== 'active') return null;
    if (toolKey && ctx.permissions && ctx.permissions[toolKey] === false) return null;
    return ctx.centerId;
  }

  // Log an activity entry against the CURRENTLY ACTIVE center workspace (if
  // any), visible to that center's owner. No-op in the personal workspace.
  async function logActivity(page, action, detail) {
    try {
      const ctx = await getContext();
      if (!ctx.loggedIn || !ctx.isActiveContextCenter) return;

      await db().ref(`users/${ctx.centerId}/centers/activity`).push({
        uid: ctx.uid,
        email: ctx.email,
        name: ctx.name,
        page: page,
        action: action,
        detail: detail || '',
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('logActivity error:', err);
    }
  }

  // ---------------------------------------------------------------------
  // Custom center link (e.g. rehablix.com/rehabverve)
  // Slugs need a fast lookup ("is this slug taken? which center is it?")
  // that Realtime Database can't do by scanning nested user records, so we
  // keep one small top-level index: centerSlugs/{slug} -> centerUid.
  // The slug's actual value + its last-changed date still live with the
  // center itself, at users/{centerUid}/centers.slug / .slugUpdatedAt.
  // ---------------------------------------------------------------------
  const SLUG_EDIT_COOLDOWN_DAYS = 15;
  const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/; // 3-30 chars, lowercase/digits/hyphens, no leading/trailing hyphen

  const RESERVED_SLUGS = new Set([
    'index', 'admin', 'settings', 'ask', 'doc', 'docresult', 'documentation', 'audio',
    'rom', 'gait', 'presentation', 'project', 'study', 'exam', 'standardized', 'assignment',
    'answer', 'result', 'sub', 'format', 'formatresult', 'join', 'login', 'register', 'js', 'css', 'img'
  ]);

  function normalizeSlug(raw) {
    return (raw || '').trim().toLowerCase();
  }

  function slugValidationError(slug) {
    if (!slug) return 'Enter a link.';
    if (!SLUG_PATTERN.test(slug)) return 'Use 3-30 lowercase letters, numbers, or hyphens (no spaces, no leading/trailing hyphen).';
    if (RESERVED_SLUGS.has(slug)) return 'That link is reserved. Please choose another.';
    return null;
  }

  // Returns { available: bool, ownedByYou: bool }
  async function checkSlugAvailable(slug, centerUid) {
    const snap = await db().ref('centerSlugs/' + slug).once('value');
    const owner = snap.val();
    if (!owner) return { available: true, ownedByYou: false };
    return { available: owner === centerUid, ownedByYou: owner === centerUid };
  }

  function daysUntilSlugEditable(slugUpdatedAt) {
    if (!slugUpdatedAt) return 0;
    const elapsedMs = Date.now() - new Date(slugUpdatedAt).getTime();
    const remainingDays = SLUG_EDIT_COOLDOWN_DAYS - (elapsedMs / 86400000);
    return Math.max(0, Math.ceil(remainingDays));
  }

  // Sets/changes a center's custom link. Throws a descriptive Error on
  // validation failure, taken slug, or an active cooldown.
  async function setCenterSlug(centerUid, rawSlug) {
    const slug = normalizeSlug(rawSlug);
    const validationError = slugValidationError(slug);
    if (validationError) throw new Error(validationError);

    const centerSnap = await db().ref(`users/${centerUid}/centers`).once('value');
    const center = centerSnap.val();
    if (!center) throw new Error('Center not found.');

    const previousSlug = center.slug || null;
    if (previousSlug === slug) return slug; // no-op, nothing changed

    const remainingDays = daysUntilSlugEditable(center.slugUpdatedAt);
    if (previousSlug && remainingDays > 0) {
      throw new Error(`You can change your center link again in ${remainingDays} day${remainingDays === 1 ? '' : 's'}.`);
    }

    const { available } = await checkSlugAvailable(slug, centerUid);
    if (!available) throw new Error('That link is already taken. Please choose another.');

    const updates = {};
    updates[`centerSlugs/${slug}`] = centerUid;
    if (previousSlug) updates[`centerSlugs/${previousSlug}`] = null; // free up the old one
    updates[`users/${centerUid}/centers/slug`] = slug;
    updates[`users/${centerUid}/centers/slugUpdatedAt`] = new Date().toISOString();

    await db().ref().update(updates);
    return slug;
  }

  // Looks up which center owns a given slug, for join.html.
  async function getCenterBySlug(rawSlug) {
    const slug = normalizeSlug(rawSlug);
    if (!slug) return null;
    const ownerSnap = await db().ref('centerSlugs/' + slug).once('value');
    const centerUid = ownerSnap.val();
    if (!centerUid) return null;
    const centerSnap = await db().ref(`users/${centerUid}/centers`).once('value');
    const center = centerSnap.val();
    if (!center) return null;
    return { centerUid, ...center };
  }

  window.RehablixCenter = {
    TOOL_KEYS,
    getContext,
    getAvailableContexts,
    switchActiveContext,
    getEffectiveScopeUid,
    convertToCenter,
    inviteMember,
    linkPendingInviteForUser,
    respondToInvite,
    getPendingInvites,
    migrateLegacyCenterNode,
    migrateLegacyMembership,
    setMemberPermission,
    setMemberStatus,
    removeMember,
    checkAccess,
    logActivity,
    slugValidationError,
    checkSlugAvailable,
    daysUntilSlugEditable,
    setCenterSlug,
    getCenterBySlug,
    SLUG_EDIT_COOLDOWN_DAYS
  };
})();
