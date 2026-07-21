import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectNosana, isRunningOnNosana, nosanaJobUrl } from './detect.js'

// A real-shaped Solana pubkey (base58, 44 chars) — the form NOSANA_ID takes in
// production (the on-chain job account address).
const JOB = '4fobHJEHBxVppziJnUir4GXEJQEsC2JdR4WJqSU7nNKc'

test('detects NOSANA_ID as injected by the Nosana node', () => {
  const ctx = detectNosana({ NOSANA_ID: JOB })
  assert.ok(ctx)
  assert.equal(ctx.jobId, JOB)
  assert.equal(ctx.source, 'NOSANA_ID')
  assert.equal(ctx.isAddress, true)
  assert.equal(ctx.dashboardUrl, `https://dashboard.nosana.com/jobs/${JOB}`)
})

test('falls back to NOSANA_JOB_ID, then JOB_ID', () => {
  assert.equal(detectNosana({ NOSANA_JOB_ID: JOB })?.source, 'NOSANA_JOB_ID')
  assert.equal(detectNosana({ JOB_ID: JOB })?.source, 'JOB_ID')
})

test('NOSANA_ID wins over the fallbacks', () => {
  const ctx = detectNosana({ NOSANA_ID: JOB, NOSANA_JOB_ID: 'other', JOB_ID: 'other' })
  assert.equal(ctx?.source, 'NOSANA_ID')
  assert.equal(ctx?.jobId, JOB)
})

test('returns null outside Nosana', () => {
  assert.equal(detectNosana({}), null)
  assert.equal(detectNosana({ PATH: '/usr/bin', HOME: '/root' }), null)
  assert.equal(isRunningOnNosana({}), false)
})

test('empty or whitespace ids do not count as detection', () => {
  assert.equal(detectNosana({ NOSANA_ID: '' }), null)
  assert.equal(detectNosana({ NOSANA_ID: '   ' }), null)
})

test('a non-address id still detects but gets no dashboard link', () => {
  const ctx = detectNosana({ NOSANA_ID: 'not-a-pubkey!' })
  assert.ok(ctx)
  assert.equal(ctx.isAddress, false)
  assert.equal(ctx.dashboardUrl, undefined)
})

test('deployment id is carried when present', () => {
  const ctx = detectNosana({ NOSANA_ID: JOB, DEPLOYMENT_ID: 'dep-123' })
  assert.equal(ctx?.deploymentId, 'dep-123')
  const bare = detectNosana({ NOSANA_ID: JOB })
  assert.equal(bare?.deploymentId, undefined)
})

test('isRunningOnNosana mirrors detection', () => {
  assert.equal(isRunningOnNosana({ NOSANA_ID: JOB }), true)
})

test('nosanaJobUrl builds the dashboard link', () => {
  assert.equal(nosanaJobUrl(JOB), `https://dashboard.nosana.com/jobs/${JOB}`)
})
