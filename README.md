This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase setup notes

**Storage buckets must be Private.** The app serves stored files only through
signed URLs (`createSignedUrl`) and never uses public URLs. The buckets the code uses:

- `clips`: clip videos, coach voice notes (`<playerId>/<clipId>/voice.<ext>`), timestamp voice notes (`<playerId>/<clipId>/ts_voice/<uid>.<ext>`), and profile photos (`avatars/<userId>.<ext>`)
- `lessons`: coach lesson recordings (created by migration 016 as private)

In the Supabase dashboard, go to Storage, open each bucket's settings and turn
"Public bucket" off. No migration is needed. The code doesn't create the `clips`
bucket, so check it there. There is no separate `avatars` bucket: profile photos
are stored in `clips`. Migrations 008/012 also create a public `profiles` bucket.
The app no longer uploads to it; only account deletion still removes old avatars
from it.

**Auth redirect URLs** (Authentication → URL Configuration → Redirect URLs).
Email links come back to `/auth/confirm` and `/auth/callback`, including the
password reset link (`/auth/confirm?next=%2Fauth%2Freset`). Allow
`https://releasepointai.com/auth/confirm**` and `https://releasepointai.com/auth/callback**`.
Reset links are built from `NEXT_PUBLIC_SITE_URL`, falling back to
`https://releasepointai.com` when it is unset. For local dev, set
`NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `.env.local`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
