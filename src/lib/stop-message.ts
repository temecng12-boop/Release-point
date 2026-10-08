// The message shown when an age answer stops signup or freezes an account.
// Kept apart from ./under13-mode so the signup form's browser code carries no
// copy that names the age cutoff. It points to a parent or guardian (coaches
// can't give permission) and to the privacy contact, never to the coach.
export const AGE_STOP_MESSAGE =
  "We need a parent's or guardian's permission first. Please ask a parent or guardian, or email privacy@releasepointai.com."
