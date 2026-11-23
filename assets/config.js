/*
 * BioPulse runtime config.
 *
 * apiBase: where the backend (Netlify Functions) lives.
 *  - On Netlify, leave it as '' (same origin, nothing to configure).
 *  - On GitHub Pages, set it to your Netlify site URL, e.g. 'https://biopulse-xyz.netlify.app',
 *    and add the GitHub Pages origin to ALLOWED_ORIGINS in Netlify if it is not
 *    https://kingismymiddlename.github.io (that one is allowed by default).
 */
window.BIOPULSE_CONFIG = {
  apiBase: '',
};
