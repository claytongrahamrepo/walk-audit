/* Settings for this copy of the walk audit tool. */
window.WA_CONFIG = {
  community: 'East Providence, RI',
  center: [41.8137, -71.3701],   // where the map opens before the phone finds its location
  zoom: 14,

  /* Shared Google Sheet. Paste the web app URL from backend/SETUP.md here.
   * Leave empty to run without a shared sheet: each person's work stays on
   * their phone and they send the organizer a zip file instead. */
  syncUrl: '',

  /* Must match KEY in backend/Code.gs. This is visible to anyone who reads
   * the page source. It keeps out stray bots, not a determined person. */
  key: ''
};
