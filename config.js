/* Settings for this copy of the walk audit tool. */
window.WA_CONFIG = {
  /* Leave these empty for a tool anyone can use anywhere: each person types
   * their own community, and the map opens where their phone is. Fill them in
   * only for a copy meant for one place, e.g. community: 'Springfield, IL',
   * center: [39.80, -89.65], zoom: 14. */
  community: '',
  center: null,
  zoom: 14,

  /* Shared Google Sheet. Paste the web app URL from backend/SETUP.md here.
   * Leave empty to run without a shared sheet: each person's work stays on
   * their phone, they send themselves a copy, and a walk leader combines the
   * copies with Team totals. Nobody collects anything centrally. */
  syncUrl: '',

  /* Must match KEY in backend/Code.gs. This is visible to anyone who reads
   * the page source. It keeps out stray bots, not a determined person. */
  key: ''
};
