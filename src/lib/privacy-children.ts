// Privacy page section 5: Children and Teens (Compliance draft Oct 7, 2026,
// non-lawyer draft for counsel review). Kept in its own module so the next
// Compliance wording pass is a one-file swap. The under-13 claims below are
// written at full strength: the sibling enforcement PR lands them as
// migration 043 (under-13 signup block, no under-13 coach adds/invites, no
// under-13 uploads on the server and DB side), and this PR merges after
// 043 is live.
export const CHILDREN_AND_TEENS_TITLE = '5. Children and Teens'

export const CHILDREN_AND_TEENS_BODY = `Release Point is a pitching and hitting development app for baseball, softball, and other throwing and hitting sports. Its players range from youth to adult, so this section explains how we handle age.

**How we check age at signup**

- Everyone who signs up uses one screen. It asks for birth month and year, name and email, and requires accepting our Terms of Service. We save these answers at signup, and the birth month and year can't be changed later.
- **If you sign up with Google (or Apple, where offered),** we ask for birth month and year before you can use the app. An under-13 answer here deletes the new account and its name and email.

**Children under 13**

- **Children under 13 can't create an account right now.** If the birth month and year show someone is under 13, signup stops and no account is created. We don't save the child's name or email.
- **Parent permission is coming.** We're building a way for a parent or guardian to review what Release Point collects and give permission for their child to use it. We expect it in late October 2026. Until it's live, children under 13 can't use Release Point. When it launches, we'll update this policy before any child under 13 can join.
- **If we learn that a child under 13 has an account anyway,** we'll freeze it right away. No one can use it or add to it. We'll then delete the child's personal information, including video, within 14 days.
- **Parents:** if you think your child under 13 has an account or gave us information, email **privacy@releasepointai.com**. We'll confirm you're the parent or guardian, then let you review the information or have it deleted.

**Teens 13 to 17**

- Teens 13 to 17 can create their own account. They enter their birth month and year and accept the Terms. They don't need a parent's permission to use the app or upload video.
- **Accounts created before October 2026:** some players were added by a coach before the birth month and year screen existed. For those players, we use the age group the coach entered.
- **Teen accounts are private.** Release Point has no public profiles or public clip pages. A teen's clips and data can be seen by the teen, the coaches on the teen's teams, and a parent or guardian linked to the teen's account (once parent accounts launch) (see "Who can see your information").
- **We don't sell teens' personal information, share it for advertising, or show ads.**
- **AI Coach:** teens can currently use AI Coach. It sends text, never video or audio, to our AI provider, Anthropic (see "Service providers"). We're adding more protections for teens, expected in late October 2026: an off switch, a clear label that AI Coach is an AI and not a person, and sending only first names. We'll update this policy when they're live.
- **Removing content:** teens can delete clips they uploaded themselves. They can also email **privacy@releasepointai.com** to ask us to remove anything they posted, or to delete their account and data.

**Coaches**

- Coaches must give each player's correct age group and must not add a child under 13. A coach can't give permission on behalf of a parent, and Release Point doesn't treat a coach's action as a parent's permission.

**Contact**

- For questions about a child's or teen's information, email **privacy@releasepointai.com**.`
