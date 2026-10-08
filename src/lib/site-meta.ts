// Single place for site-wide public constants: domain, social preview, the
// operator placeholder, and UI feature flags. Imported by layout metadata,
// legal pages, and tests, so each value is easy to swap in one edit.
import type { Metadata, ResolvingMetadata } from 'next'

export const SITE_URL = 'https://releasepointai.com'

// Social preview (public/og-image.png). Swap OG_IMAGE_PATH when Design
// ships a new asset; width/height/alt travel with the metadata below.
export const OG_IMAGE_PATH = '/og-image.png'
export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630
export const OG_IMAGE_ALT = 'Release Point AI: video coaching for pitchers and hitters'

// Operator shown on legal pages. Fill in the Nevada LLC name once formed
// (e.g. Release Point AI LLC, not filed); the brackets make the
// placeholder impossible to miss in review.
export const LEGAL_ENTITY_PLACEHOLDER = '[LEGAL_ENTITY_NAME]'
export const OPERATOR_NAME = 'Nolan George'

// Parent permission for under-13 players ships in late October 2026
// (parent accounts are not live yet). One phrase, used everywhere.
export const PARENT_CONSENT_TIMELINE = 'in late October 2026'

// Apple sign-in is not enabled yet (Google is live). When Apple ships,
// flip this to true to show the "Continue with Apple" buttons on the
// login and signup screens. Auth logic is untouched; this only gates UI.
export const APPLE_SIGNIN_ENABLED = false

// Per-page canonical + social URL. Route metadata only sets its own path;
// the parent (root layout) openGraph — title, description, images — is
// spread back in, because Next shallow-merges openGraph across segments and
// a bare `{ openGraph: { url } }` would wipe the social image. Returns a
// Metadata object for generateMetadata (not a static export, since it reads
// the parent).
export async function pageMetadata(
  canonicalPath: string,
  parent: ResolvingMetadata,
  extra?: Metadata,
): Promise<Metadata> {
  const prev = await parent
  return {
    ...extra,
    alternates: { canonical: canonicalPath },
    openGraph: { ...prev.openGraph, url: canonicalPath },
  }
}
