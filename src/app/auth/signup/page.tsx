import { cookies } from 'next/headers'
import { AGE_STOP_COOKIE } from '@/lib/age-band'
import SignupForm from './signup-form'

// The stop cookie (24 hours after an under-13 answer) is httpOnly, so it's
// read here: the player form then shows only the stop message. The server
// action refuses every submission while it's set anyway.
export default async function SignupPage() {
  const ageStopped = !!(await cookies()).get(AGE_STOP_COOKIE)
  return <SignupForm ageStopped={ageStopped} />
}
