import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { downloadAndExtractRepo, getCommitRepo } from '../utils/git'
import { Codebase } from '../model/codebase'

const repoRequestValidator = zValidator(
  'json',
  z.object({
    user: z.string(),
    repo: z.string(),
    branch: z.string(),
    token: z.string()
  })
)

const createGraphTest = new Hono()

createGraphTest.post('/', repoRequestValidator, async (c) => {
  const request = c.req.valid('json')
  const {
    user: repoOrg,
    repo: repoName,
    branch,
    token: gitAccessToken
  } = request
  console.time(repoName)
  const gitProvider = 'github'
  console.log({ gitProvider, repoOrg, repoName, branch })

  const commitHash = await getCommitRepo(gitProvider, repoOrg, repoName, branch, gitAccessToken)

  const codebasePath = await downloadAndExtractRepo(gitProvider, repoOrg, repoName, branch, gitAccessToken, commitHash)
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
