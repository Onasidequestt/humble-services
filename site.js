// Contact form for the review draft. Validates on the page. Sends nothing while the submit switch
// (forms_config.js's window.HUMBLE_FORMS_BASE_URL) is empty, and says so; wired to POST when it is set.
// The send control is a plain button (type="button"), not a native form submit: a sandboxed frame without
// allow-forms never fires submit, and a real submit would try to leave the page. No browser dialogs.
// Only name, email and the consent tick box are needed. The qualification fields (role, industry, revenue, timeline, sale/transition, state,
// employees and the rest) are optional and are never validated.
// Enter: a form with several fields and no submit button does not submit on Enter by itself, so Enter in a text field
// runs the same check as the button. Any submit event that does fire is stopped and checked the same way.
(function () {
  'use strict';
  var form = document.getElementById('contact-form');
  if (!form) return;

  // Browser-only prefill (ruling (a), 2026-09-27): only what THIS visitor typed on THIS browser, never
  // fetched from a server. Shared with the scorecard's lead step via the same localStorage key. Consent boxes
  // are never prefilled from here; consent is ticked fresh every time.
  var VISITOR_KEY = 'humble-visitor';
  function loadVisitor() {
    try { var v = JSON.parse(localStorage.getItem(VISITOR_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function saveVisitor(v) {
    try { localStorage.setItem(VISITOR_KEY, JSON.stringify(v)); } catch (e) {}
  }
  function clearVisitor() {
    try { localStorage.removeItem(VISITOR_KEY); } catch (e) {}
  }
  function prefill() {
    var v = loadVisitor();
    if (v.name) form.elements.name.value = v.name;
    if (v.email) form.elements.email.value = v.email;
    if (v.phone) form.elements.phone.value = v.phone;
    if (v.business_name) form.elements.company.value = v.business_name;
    if (v.industry) form.elements.industry.value = v.industry;
    if (v.employees) form.elements.employees.value = v.employees;
    if (v.revenue) form.elements.revenue.value = v.revenue;
  }
  prefill();

  var clearBtn = document.getElementById('contact-clear-memory');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    clearVisitor();
    form.reset();
    var notice = document.getElementById('contact-notice');
    notice.textContent = 'Cleared what this browser remembered about you.';
    notice.hidden = false;
    notice.focus();
  });

  function setError(inputId, errId, message) {
    var input = document.getElementById(inputId), err = document.getElementById(errId);
    err.textContent = message;
    err.hidden = !message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  // Field-name mapping onto the endpoint contract agreed with the platform team: timeline→start_when,
  // issue→topic, more→notes, succession→considering_sale, role→role_in_business, company→business_name.
  function contactPayload(name, email, consentText, lettersChecked, lettersText) {
    var v = key => String(form.elements[key] ? form.elements[key].value || '' : '').trim() || undefined;
    var succ = form.querySelector('input[name="succession"]:checked');
    return {
      email: email, name: name,
      phone: v('phone'), business_name: v('company'), website: v('website'),
      industry: v('industry') || undefined, role_in_business: v('role') || undefined,
      employees: v('employees') || undefined, revenue: v('revenue') || undefined, state: v('state') || undefined,
      topic: v('issue') || undefined, start_when: v('timeline') || undefined,
      considering_sale: succ ? succ.value : undefined, notes: v('more'),
      consent_contact: true, consent_text: consentText,
      letters_opt_in: !!lettersChecked, letters_text: lettersChecked ? lettersText : undefined,
    };
  }

  function check() {
    var name = form.elements.name.value.trim();
    var email = form.elements.email.value.trim();
    var okName = setError('c-name', 'err-name', name ? '' : 'Please enter your name.');
    var okEmail = setError('c-email', 'err-email', !email ? 'Please enter your email address.'
      : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Please check the email address.'));
    // Consent tick box, as on the scorecard: required for Send, shown with the same inline error style.
    var okConsent = setError('c-consent', 'err-consent', form.elements.consent.checked ? ''
      : 'To request a conversation, please tick this box so we may contact you.');
    var notice = document.getElementById('contact-notice');
    if (!(okName && okEmail && okConsent)) {
      notice.hidden = true;
      document.getElementById(!okName ? 'c-name' : !okEmail ? 'c-email' : 'c-consent').focus();
      return;
    }

    var lettersEl = document.getElementById('c-letters');
    var lettersChecked = !!(lettersEl && lettersEl.checked);
    var consentSpan = document.getElementById('c-consent').closest('label').querySelector('span');
    var lettersSpan = lettersEl && lettersEl.closest('label').querySelector('span');
    var consentText = consentSpan ? consentSpan.textContent : undefined;
    var lettersText = lettersSpan ? lettersSpan.textContent : undefined;

    // Save what this visitor typed, on this browser only, so it can prefill next time. Never sent anywhere;
    // never includes the consent ticks themselves.
    saveVisitor({
      name: name, email: email,
      phone: form.elements.phone.value.trim() || undefined,
      business_name: form.elements.company.value.trim() || undefined,
      industry: form.elements.industry.value || undefined,
      employees: form.elements.employees.value || undefined,
      revenue: form.elements.revenue.value || undefined,
    });

    var base = window.HUMBLE_FORMS_BASE_URL;
    if (!base) {
      notice.textContent = 'This is a review draft, so nothing was sent. On the live site this step would save your request and offer times for your conversation.';
      notice.hidden = false;
      notice.focus();
      return;
    }
    // Switched on: POST the request, then show a plain result. Never display anything from the response body
    // except the "received" acknowledgement.
    var payload = contactPayload(name, email, consentText, lettersChecked, lettersText);
    fetch(base + '/api/public/forms/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).then(function (r) {
      if (r.status === 202) {
        notice.textContent = 'Thank you — your request has been received.';
      } else {
        notice.textContent = "Sorry, that couldn't be sent. Please email office@humblebusinessconsulting.com.";
      }
      notice.hidden = false;
      notice.focus();
    }).catch(function () {
      notice.textContent = "Sorry, that couldn't be sent. Please email office@humblebusinessconsulting.com.";
      notice.hidden = false;
      notice.focus();
    });
  }

  // Text-like inputs only: Enter keeps its own meaning on buttons, radios, checkboxes, selects and the textarea.
  var NOT_TEXT = /^(radio|checkbox|button|submit|reset|image|file|range|color)$/i;
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    var t = e.target;
    if (t.tagName !== 'INPUT' || NOT_TEXT.test(t.type)) return;
    e.preventDefault();
    check();
  });
  document.getElementById('contact-send').addEventListener('click', check);
  form.addEventListener('submit', function (e) { e.preventDefault(); check(); });
})();
