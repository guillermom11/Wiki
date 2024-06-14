import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { downloadAndExtractRepo, getAccessToken, getCommitRepo } from '../utils/git'
import { Codebase } from '../model/codebase'
import { jwtVerify } from 'jose'
import { sql } from '../utils/db'
import { getEnv } from '../utils/utils'

const secret = getEnv('SUPABASE_JWT')

const repoRequestValidator = zValidator(
  'json',
  z.object({
    git_provider: z.enum(['github', 'gitlab', 'bitbucket']),
    repo_org: z.string(),
    repo_name: z.string(),
    branch: z.string(),
    connection_id: z.string()
  })
)

const createGraphTest = new Hono()

createGraphTest.post('/', repoRequestValidator, async (c) => {
  const request = c.req.valid('json')
  const {
    git_provider: gitProvider,
    repo_org: repoOrg,
    repo_name: repoName,
    branch,
    connection_id: connectionId
  } = request
  const accessToken = c.req.header('Authorization')?.split('Bearer ')[1]

  if (!accessToken) {
    return c.json(
      {
        message: 'Unauthorized'
      },
      401
    )
  }

  const { payload } = await jwtVerify(accessToken, new TextEncoder().encode(secret))
  const userId = payload.sub

  if (!userId) {
    return c.json(
      {
        message: 'Unauthorized'
      },
      401
    )
  }

  const resOrg = await sql`SELECT org_sel_id FROM profiles WHERE id = ${userId}`
  const userOrgId = resOrg[0].org_sel_id

  const gitAccessToken = await getAccessToken(gitProvider, connectionId, userOrgId)

  if (!gitAccessToken) {
    console.log('Failed to get access token')
    return c.json({ message: 'Failed to get access token' }, 500)
  }

  const commitHash = await getCommitRepo(gitProvider, repoOrg, repoName, branch, gitAccessToken)

  const codebasePath = await downloadAndExtractRepo(
    gitProvider,
    repoOrg,
    repoName,
    branch,
    gitAccessToken,
    commitHash
  )
  if (!codebasePath) {
    console.log('Failed to download repo')
    return c.json({ message: 'Failed to download repo' }, 500)
  }

  const codebase = new Codebase(codebasePath)
  const fileNodesMap = await codebase.parseFolder()
  codebase.getCalls(fileNodesMap, false)
  const nodes = codebase.simplify()
  const links = codebase.getLinks()

  console.timeEnd(repoName)
  return c.json({ graph: { nodes, links } })
})

export { createGraphTest }
