/**
 * Single source of truth for which workspace feature phases are currently live.
 *
 * WorkspaceSidebar and the workspace dashboard both import from here so that
 * enabling a new phase requires changing only LIVE_PHASE in this file.
 * When a phase is deployed and verified, increment LIVE_PHASE.
 */

/** The highest phase number currently deployed and verified in production. */
export const LIVE_PHASE = 5;

/**
 * Feature phase configuration per workspace module.
 * - `phase` : the phase number in which this feature was/will be released
 * - `label` : human-readable label used in nav items and dashboard cards
 * - `href`  : function (slug) => string for live phases, null for upcoming ones
 *
 * @type {Record<string, { phase: number, label: string, href: ((slug: string) => string) | null }>}
 */
export const PHASES = {
  files:    { phase: 2, label: 'Archivos',   href: (slug) => `/w/${slug}/files` },
  activity: { phase: 3, label: 'Actividad',  href: null },
  docs:     { phase: 4, label: 'Docs',       href: (slug) => `/w/${slug}/docs` },
  chat:     { phase: 5, label: 'Chat',       href: (slug) => `/w/${slug}/chat` },
};

/**
 * Returns true if the given phase number is currently live.
 * @param {number} p
 * @returns {boolean}
 */
export const isPhaseLive = (p) => p <= LIVE_PHASE;
