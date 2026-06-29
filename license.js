// ================================================================
//  VLA Group Life Pricing Engine — Licence Gate  v2.0
//  ────────────────────────────────────────────────────────────────
//  Works without any HTML changes: banner elements are injected
//  dynamically into .login-box and the Sign In button is found
//  by its class, not an id.
//
//  To RENEW:  change LICENCE_EXPIRY to the new date (YYYY-MM-DD)
//             then redeploy this file only — index.html unchanged.
//
//  To change the warning window: update LICENCE_WARN_DAYS.
//
//  Behaviour:
//    > WARN_DAYS before expiry  : amber banner, login still works
//    within WARN_DAYS of expiry : amber banner with countdown
//    on / after expiry date     : red banner, Sign In disabled
// ================================================================

var LICENCE_EXPIRY    = '2026-06-30';  // ← update this to renew
var LICENCE_WARN_DAYS = 14;            // days before expiry to warn

// ── Inject banner elements into .login-box ───────────────────────
// Called once on DOMContentLoaded. Creates the two banner divs
// above the username field so they're already in the DOM when
// checkLicence() runs.
function injectLicenceBanners() {
  var box = document.querySelector('.login-box');
  if (!box) return; // login box not found — nothing to do

  // Find the first .login-fld (Username row) to insert before it
  var firstField = box.querySelector('.login-fld');

  // ── Amber warning banner (shown when expiry is approaching) ──
  var warn = document.createElement('div');
  warn.id = 'lic-warn';
  warn.style.cssText = [
    'background:#FFF8E1',
    'color:#7B5800',
    'border:1px solid #FFE082',
    'border-radius:4px',
    'padding:8px 12px',
    'font-size:12px',
    'margin-bottom:12px',
    'line-height:1.5',
    'display:none'
  ].join(';');
  box.insertBefore(warn, firstField);

  // ── Red expired banner (shown on/after expiry date) ──────────
  var expired = document.createElement('div');
  expired.id = 'lic-expired';
  expired.style.cssText = [
    'background:#FEE8E8',
    'color:#B71C1C',
    'border:1px solid #FFCDD2',
    'border-radius:4px',
    'padding:8px 12px',
    'font-size:12px',
    'margin-bottom:12px',
    'line-height:1.5',
    'display:none'
  ].join(';');
  // Expired banner content is static (date filled in by checkLicence)
  expired.innerHTML =
    '<strong>&#9888; Licence Expired</strong><br>' +
    'This application\'s licence expired on ' +
    '<strong><span id="lic-exp-date2"></span></strong>. ' +
    'Contact your administrator to renew.';
  box.insertBefore(expired, firstField);
}

// ── Core licence check ───────────────────────────────────────────
function checkLicence() {
  var expiry   = new Date(LICENCE_EXPIRY + 'T00:00:00');
  var today    = new Date(); today.setHours(0, 0, 0, 0);
  var msPerDay = 24 * 60 * 60 * 1000;
  var daysLeft = Math.ceil((expiry - today) / msPerDay);

  // Human-readable expiry date, e.g. "31 Dec 2026"
  var months = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
  var displayDate = expiry.getDate() + ' ' +
                    months[expiry.getMonth()] + ' ' +
                    expiry.getFullYear();

  // DOM refs — elements were injected by injectLicenceBanners()
  var warnEl    = document.getElementById('lic-warn');
  var expiredEl = document.getElementById('lic-expired');
  var dateEl    = document.getElementById('lic-exp-date2');
  var loginBtn  = document.querySelector('.login-btn');

  // Guard: if any element is missing, fail safe (allow login)
  if (!warnEl || !expiredEl || !loginBtn) {
    console.warn('licence.js: expected DOM elements not found — skipping gate');
    return true;
  }

  // ── EXPIRED ─────────────────────────────────────────────────
  if (daysLeft <= 0) {
    if (dateEl) dateEl.textContent = displayDate;
    expiredEl.style.display = 'block';
    warnEl.style.display    = 'none';
    loginBtn.disabled       = true;
    loginBtn.style.opacity  = '0.5';
    loginBtn.style.cursor   = 'not-allowed';
    loginBtn.title          = 'Licence expired — contact your administrator';
    return false;
  }

  // ── WARNING WINDOW ───────────────────────────────────────────
  if (daysLeft <= LICENCE_WARN_DAYS) {
    var remaining = daysLeft === 1
      ? '1 day remaining'
      : daysLeft + ' days remaining';
    warnEl.innerHTML =
      '<strong>&#9888; Licence Expiring Soon</strong><br>' +
      'Expires <strong>' + displayDate + '</strong> \u2014 ' +
      remaining + '. Contact your administrator to renew.';
    warnEl.style.display    = 'block';
    expiredEl.style.display = 'none';
    loginBtn.disabled       = false;
    loginBtn.style.opacity  = '';
    loginBtn.style.cursor   = '';
    loginBtn.title          = '';
    return true;
  }

  // ── ALL CLEAR ────────────────────────────────────────────────
  warnEl.style.display    = 'none';
  expiredEl.style.display = 'none';
  loginBtn.disabled       = false;
  loginBtn.style.opacity  = '';
  loginBtn.style.cursor   = '';
  loginBtn.title          = '';
  return true;
}

// ── Boot ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  injectLicenceBanners();
  checkLicence();
});
