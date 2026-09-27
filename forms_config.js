// The ONE switch for whether either public form (contact.html, the scorecard lead step) sends anything.
// Empty string = OFF: no fetch is ever made anywhere, and both forms keep today's "review draft, nothing was
// sent" notice. Set it to an origin with no trailing slash (e.g. 'https://forms.humblebusinessconsulting.com')
// to turn submission on; the forms then POST JSON to <base>/api/public/forms/scorecard or /contact.
// SIMPLIFICATION (deliberate): one hardcoded literal, not a build-time or environment value. Ceiling: fine for
// one static site with exactly two forms and no staging/prod split. Upgrade: inject this at deploy time (a
// small template step, same idea as scorecard/build_artifact.py) if more forms or environments are added.
//
// The scorecard's public build cannot load an external script file (build_artifact.py guards against a
// surviving script tag with a src attribute), so it cannot read this file directly. scorecard.js carries its
// own copy of the same literal
// (FORMS_BASE_URL); site_tools/check_site.js's S29f rung asserts the two literals match so they cannot drift
// apart silently. This file is the one a person edits to flip the switch; scorecard.js is kept in step by hand
// and the check catches any slip.
window.HUMBLE_FORMS_BASE_URL = '';
