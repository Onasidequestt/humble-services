// Contact form for the review draft. Validates on the page, sends NOTHING, and says so.
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

  function setError(inputId, errId, message) {
    var input = document.getElementById(inputId), err = document.getElementById(errId);
    err.textContent = message;
    err.hidden = !message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
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
    notice.textContent = 'This is a review draft, so nothing was sent. On the live site this step would save your request and offer times for your conversation.';
    notice.hidden = false;
    notice.focus();
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
