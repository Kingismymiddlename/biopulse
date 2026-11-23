/*
 * BioPulse runtime config.
 *
 * apiBase: where the backend (Netlify Functions) lives.
 *  - On Netlify the site and backend share an address, so it stays '' there.
 *  - The GitHub Pages copy (kingismymiddlename.github.io) calls the Netlify backend below.
 * If you rename the Netlify site, update the address here.
 */
window.BIOPULSE_CONFIG = {
  apiBase: /\.github\.io$/i.test(location.hostname) ? 'https://helpful-quokka-a6fbcf.netlify.app' : '',
};
