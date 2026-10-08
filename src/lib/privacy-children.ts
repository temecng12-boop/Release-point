// Privacy page section 5: Children and Teens.
// Kept in its own module so the next wording pass is a one-file swap.
//
// UNDER_13_POLICY_BODY is used word for word on Privacy and Terms, so the
// policy is identical on every page that states it. Coach-add and no-video
// (clips or lessons) sentences match migration 043, now live on main.
// Permission duties on teens and coaches are policy obligations on users,
// not code.
export const CHILDREN_AND_TEENS_TITLE = '5. Children and Teens'

export const UNDER_13_POLICY_BODY = `**Children under 13**

- Children under 13 cannot sign up. Signup asks for birth month and year; if the answer shows under 13, signup stops and no account is created. We don't save the child's name or email.
- The age question comes before Google sign-in, so an under-13 answer never starts it. If an under-13 answer comes after sign-in, the account is frozen and its profile name is removed. The sign-in email on the auth account stays.
- Coaches cannot add players under 13, and a coach can't give permission on behalf of a parent or guardian.
- No video (clips or lessons) can be uploaded for anyone marked under 13.
- If a player answers under 13 after they have an account, we freeze it right away so they can't use the app or add video, and we remove the profile name. If a coach marks a player under 13, that player can't have video added, and a signed-in player with that mark is sent to the stop screen. We'll delete the child's personal information, including any video, promptly.
- If we add parent accounts, we'll update this policy first.

**Teens 13 to 17**

- Players 13 to 17 need a parent's or guardian's permission to use Release Point AI.
- Coaches must have written parent or guardian consent before uploading video of any minor.
- Teens enter their birth month and year and accept the Terms themselves.`

export const CHILDREN_AND_TEENS_BODY = `Release Point AI is a baseball pitching and hitting development app. Its players range from youth to adult, so this section explains how we handle age.

**How we check age at signup**

- Everyone who signs up uses one screen. It asks for birth month and year, name and email, and requires accepting our Terms of Service. We save the name, email, and age band at signup. The birth month and year are used once to set the band and are never stored, and the band can't be changed later.
- **If you sign up with Google (or Apple, where offered),** we ask for birth month and year before Google or Apple sign-in starts. If you already have an account and haven't answered yet, we ask before you can use the app.

${UNDER_13_POLICY_BODY}

**Teen accounts**

- **Teen accounts are private.** Release Point AI has no public profiles or public clip pages. A teen's clips and data can be seen by the teen and the coaches on the teen's teams (see "Video and Performance Data").
- **Accounts created before the birth month and year screen:** some players were added by a coach before that screen existed. For those players, we use the age group the coach entered.
- **We don't sell teens' personal information, share it for advertising, or show ads.**
- **AI Coach:** teens can currently use AI Coach. It sends text, never video or audio, to our AI provider, Anthropic (see "Service providers").
- **Removing content:** teens can delete clips they uploaded themselves. They can also email **privacy@releasepointai.com** to ask us to remove anything they posted, or to delete their account and data.

**Coaches**

- Coaches must give each player's correct age group and must not add a child under 13. A coach can't give permission on behalf of a parent, and Release Point AI doesn't treat a coach's action as a parent's permission.

**Contact**

- For questions about a child's or teen's information, email **privacy@releasepointai.com**. If you think your child under 13 has an account or gave us information, email **privacy@releasepointai.com**. We'll confirm you're the parent or guardian, then let you review the information or have it deleted.`
