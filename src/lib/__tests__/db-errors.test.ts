/**
 * Run with: npx tsx --test src/lib/__tests__/db-errors.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeDbError, friendlyDbMessage, isMissingColumnError } from '../db-errors'

const missingDrawing = {
  code: 'PGRST204',
  message: "Could not find the 'drawing_data' column of 'timestamp_notes' in the schema cache",
}
const rlsRecursion = { code: '42P17', message: 'infinite recursion detected in policy for relation "players"' }

test('isMissingColumnError matches PostgREST and Postgres missing-column errors', () => {
  assert.equal(isMissingColumnError(missingDrawing, 'drawing_data'), true)
  assert.equal(isMissingColumnError({ code: '42703', message: 'column "drawing_data" does not exist' }, 'drawing_data'), true)
  assert.equal(isMissingColumnError(missingDrawing, 'reframe'), false)
  assert.equal(isMissingColumnError(rlsRecursion, 'drawing_data'), false)
  assert.equal(isMissingColumnError(null, 'drawing_data'), false)
})

test('friendlyDbMessage picks copy by error class', () => {
  assert.match(friendlyDbMessage(missingDrawing, 'Save failed.'), /missing an update/)
  assert.match(friendlyDbMessage(rlsRecursion, 'Save failed.'), /permission check failed/)
  assert.match(friendlyDbMessage({ code: '22P02', message: 'bad int' }, 'Save failed.'), /values wasn't accepted/)
  assert.equal(friendlyDbMessage(null, 'Save failed.'), 'Save failed. Please try again.')
})

test('describeDbError logs the raw error and shows it outside production', () => {
  const env = process.env as Record<string, string | undefined>
  const prevEnv = env.NODE_ENV
  const prevError = console.error
  const logged: unknown[][] = []
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    env.NODE_ENV = 'development'
    const dev = describeDbError('ctx', rlsRecursion, 'Save failed.')
    assert.match(dev, /42P17: infinite recursion/)

    env.NODE_ENV = 'production'
    const prod = describeDbError('ctx', rlsRecursion, 'Save failed.')
    assert.doesNotMatch(prod, /infinite recursion/)
    assert.match(prod, /code 42P17/)

    assert.equal(logged.length, 2)
    assert.equal(logged[0][0], '[ctx]')
    assert.deepEqual(logged[0][1], { code: '42P17', message: rlsRecursion.message, details: null, hint: null })
  } finally {
    console.error = prevError
    env.NODE_ENV = prevEnv
  }
})
