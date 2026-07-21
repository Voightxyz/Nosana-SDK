import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeJobAccount, fetchNosanaJob, NOSANA_JOBS_PROGRAM } from './onchain.js'
import { correlateNosana, nosanaAttributes } from './correlate.js'

const JOB_ADDR = '4fobHJEHBxVppziJnUir4GXEJQEsC2JdR4WJqSU7nNKc'

/** Build a raw JobAccount buffer per the on-chain layout. */
function fixture(opts: {
  state?: number
  timeStart?: number
  timeEnd?: number
  price?: bigint
  node?: number // fill byte; 0 = unclaimed (zero pubkey)
  ipfsResult?: number // fill byte; 0 = no result
}): Uint8Array {
  const data = new Uint8Array(233)
  const view = new DataView(data.buffer)
  data.fill(7, 8, 40) // ipfs_job digest
  data.fill(opts.ipfsResult ?? 0, 40, 72) // ipfs_result digest
  data.fill(1, 72, 104) // market
  data.fill(opts.node ?? 0, 104, 136) // node
  data.fill(3, 136, 168) // payer
  view.setBigUint64(168, opts.price ?? 1_500_000n, true) // price (1.5 NOS)
  data.fill(4, 176, 208) // project
  data[208] = opts.state ?? 0
  view.setBigInt64(209, BigInt(opts.timeEnd ?? 0), true)
  view.setBigInt64(217, BigInt(opts.timeStart ?? 0), true)
  view.setBigInt64(225, 3600n, true)
  return data
}

test('decodes a queued job (no node, no result, no times)', () => {
  const job = decodeJobAccount(JOB_ADDR, fixture({}))
  assert.equal(job.state, 'QUEUED')
  assert.equal(job.node, null)
  assert.equal(job.timeStart, null)
  assert.equal(job.timeEnd, null)
  assert.equal(job.ipfsResultCid, null)
  assert.equal(job.priceNos, 1.5)
  assert.equal(job.timeoutSeconds, 3600)
  assert.ok(job.ipfsJobCid?.startsWith('Qm'), `CIDv0 expected, got ${job.ipfsJobCid}`)
  assert.equal(job.dashboardUrl, `https://dashboard.nosana.com/jobs/${JOB_ADDR}`)
})

test('a claimed, unfinished job derives RUNNING', () => {
  const job = decodeJobAccount(JOB_ADDR, fixture({ state: 0, timeStart: 1_752_900_000, node: 9 }))
  assert.equal(job.state, 'RUNNING')
  assert.ok(job.node)
  assert.equal(job.timeStart, 1_752_900_000)
})

test('state bytes map: 2=COMPLETED, 3=STOPPED, 9=UNKNOWN', () => {
  assert.equal(decodeJobAccount(JOB_ADDR, fixture({ state: 2, timeStart: 1, timeEnd: 2 })).state, 'COMPLETED')
  assert.equal(decodeJobAccount(JOB_ADDR, fixture({ state: 3 })).state, 'STOPPED')
  assert.equal(decodeJobAccount(JOB_ADDR, fixture({ state: 9 })).state, 'UNKNOWN')
})

test('completed job carries end time and result CID', () => {
  const job = decodeJobAccount(JOB_ADDR, fixture({ state: 2, timeStart: 100, timeEnd: 200, ipfsResult: 5, node: 9 }))
  assert.equal(job.timeEnd, 200)
  assert.ok(job.ipfsResultCid?.startsWith('Qm'))
})

test('rejects a truncated account', () => {
  assert.throws(() => decodeJobAccount(JOB_ADDR, new Uint8Array(100)), /too small/)
})

function rpcResponse(data: Uint8Array | null, owner = NOSANA_JOBS_PROGRAM): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { value: data ? { data: [Buffer.from(data).toString('base64'), 'base64'], owner } : null },
      }),
      { status: 200 },
    )) as unknown as typeof fetch
}

test('fetchNosanaJob decodes over RPC and returns null for missing accounts', async () => {
  const job = await fetchNosanaJob(JOB_ADDR, { fetch: rpcResponse(fixture({ state: 2, timeStart: 1, timeEnd: 2 })) })
  assert.equal(job?.state, 'COMPLETED')
  assert.equal(await fetchNosanaJob(JOB_ADDR, { fetch: rpcResponse(null) }), null)
})

test('fetchNosanaJob rejects foreign accounts', async () => {
  await assert.rejects(
    fetchNosanaJob(JOB_ADDR, { fetch: rpcResponse(fixture({}), 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }),
    /not a Nosana job/,
  )
})

test('correlateNosana composes detection and chain read; attributes flatten', async () => {
  const c = await correlateNosana({
    env: { NOSANA_ID: JOB_ADDR },
    fetch: rpcResponse(fixture({ state: 0, timeStart: 42, node: 9 })),
  })
  assert.ok(c?.job)
  const attrs = nosanaAttributes(c)
  assert.equal(attrs['nosana.job_id'], JOB_ADDR)
  assert.equal(attrs['nosana.state'], 'RUNNING')
  assert.equal(attrs['nosana.started_at'], 42)
  assert.equal(attrs['nosana.price_nos'], 1.5)
  assert.ok(String(attrs['nosana.node']).length >= 32)
})

test('correlateNosana returns null off Nosana and survives RPC failure', async () => {
  assert.equal(await correlateNosana({ env: {} }), null)
  const failing = (async () => {
    throw new Error('rpc down')
  }) as unknown as typeof fetch
  const c = await correlateNosana({ env: { NOSANA_ID: JOB_ADDR }, fetch: failing })
  assert.ok(c)
  assert.equal(c.job, null)
})
