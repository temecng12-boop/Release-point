// Privacy page section 5: Children and Teens (Nolan's pre-launch spec).
// Kept in its own module so the next wording pass is a one-file swap.
//
// UNDER_13_POLICY_BODY is used word for word on Privacy and Terms, so the
// policy is identical on every page that states it. System-behavior claims
// (the Google under-13 deletion, the coach-add refusal, the freeze and
// 14-day deletion) are enforced by migration 043, which merges first; the
// permission duties are policy obligations on users, not code behavior.
// This PR stays a draft until 043 is live.
export const CHILDREN_AND_TEENS_TITLE = '5. Children and Teens'

export const UNDER_13_POLICY_BODY = `**Children under 13**

- There are no users under 13. Until parent accounts ship, children under 13 can't use Release Point.
- Children under 13 cannot sign up. Signup asks for birth month and year; if the answer shows under 13, signup stops and no account is created. We don't save the child's name or email. After Google sign-in, an under-13 answer deletes the new account and its name and email.
- Coaches cannot add players under 13, and a coach can't give permission on behalf of a parent or guardian.
- No video can be uploaded for anyone marked under 13.
- If we learn that a child under 13 has an account anyway, we'll freeze it right away. No one can use it or add to it. We'll then delete the child's personal information, including video, within 14 days.
- Parent permission is coming in late October 2026. When it launches, we'll update this policy before any child under 13 can join.

**Teens 13 to 17**

- Players 13 to 17 need a parent's or guardian's permission to use Release Point.
- Coaches must have written parent or guardian consent before uploading video of any minor.
- Teens enter their birth month and year and accept the Terms themselves.`

export const CHILDREN_AND_TEENS_BODY = `Release Point is a baseball pitching and hitting development app. Its players range from youth to adult, so this section explains how we handle age.

**How we check age at signup**

- Everyone who signs up uses one screen. It asks for birth month and year, name and email, and requires accepting our Terms of Service. We save these answers at signup, and the birth month and year can't be changed later.
- **If you sign up with Google (or Apple, where offered),** we ask for birth month and year before you can use the app.

${UNDER_13_POLICY_BODY}

**Teen accounts**

- **Teen accounts are private.** Release Point has no public profiles or public clip pages. A teen's clips and data can be seen by the teen and the coaches on the teen's teams (see "Video and Performance Data").
- **Accounts created before October 2026:** some players were added by a coach before the birth month and year screen existed. For those players, we use the age group the coach entered.
- **We don't sell teens' personal information, share it for advertising, or show ads.**
- **AI Coach:** teens can currently use AI Coach. It sends text, never video or audio, to our AI provider, Anthropic (see "Service providers"). We're adding more protections for teens, expected in late October 2026: an off switch, a clear label that AI Coach is an AI and not a person, and sending only first names. We'll update this policy when they're live.
- **Removing content:** teens can delete clips they uploaded themselves. They can also email **privacy@releasepointai.com** to ask us to remove anything they posted, or to delete their account and data.

**Coaches**

- Coaches must give each player's correct age group and must not add a child under 13. A coach can't give permission on behalf of a parent, and Release Point doesn't treat a coach's action as a parent's permission.

**Contact**

- For questions about a child's or teen's information, email **privacy@releasepointai.com**. If you think your child under 13 has an account or gave us information, email **privacy@releasepointai.com**. We'll confirm you're the parent or guardian, then let you review the information or have it deleted.`
