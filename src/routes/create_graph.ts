import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { sql } from '../utils/db'
import { downloadAndExtractRepo, getAccessToken } from '../utils/git'
import { Codebase } from '../model/codebase'
import { v4 as uuidv4 } from 'uuid'
import { jwtVerify } from 'jose'
import { getEnv } from '../utils/utils'
import { GitServiceType } from '../utils/git'
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

const createGraph = new Hono()

createGraph.post('/', repoRequestValidator, async (c) => {
  const request = c.req.valid('json')
  const {
    git_provider: gitProvider,
    repo_org: repoOrg,
    repo_name: repoName,
    branch,
    connection_id: connectionId
  } = request
  console.log({ gitProvider, repoOrg, repoName, branch })

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


    // check if repo exists
    const rows = await sql`
      SELECT 
        id
      FROM repositories
      WHERE 
        git_provider = ${gitProvider}
        AND repo_org = ${repoOrg}
        AND repo_name = ${repoName}
        AND branch = ${branch}
    `

    let repoId = uuidv4()

    if (rows.length == 0) {
      const res = await sql`
      INSERT INTO repositories (id, git_provider, repo_org, repo_name, branch)
      VALUES (${repoId}, ${gitProvider}, ${repoOrg}, ${repoName}, ${branch})`

      if (!res) {
        console.log('Failed to create repository')
        return c.json({ message: 'Failed to create repository' }, 500)
      }
    } else {
      repoId = rows[0].id
    }

  // Perform background task
  processGraphCreation({ gitProvider, repoId, repoOrg, repoName, branch, connectionId, userId })

  return c.json({ message: 'Graph creation started' })
})

async function processGraphCreation({
  gitProvider,
  repoId,
  repoOrg,
  repoName,
  branch,
  connectionId,
  userId }
  : {
    gitProvider: GitServiceType,
    repoId: string,
    repoOrg: string,
    repoName: string,
    branch: string,
    connectionId: string,
    userId: string}) {
  try {
    const resOrg = await sql`SELECT org_sel_id FROM profiles WHERE id = ${userId}`
    const userOrgId = resOrg[0].org_sel_id


    const graphId = uuidv4()

    await sql`
      INSERT INTO graphs (id, repo_id, status, org_id, user_id)
      VALUES (${graphId}, ${repoId}, 'pending', ${userOrgId}, ${userId})
    `
    const accessToken = await getAccessToken(gitProvider, connectionId, userOrgId)

    if (!accessToken) {
      console.log('Failed to get access token')
      await sql`UPDATE graphs SET status = 'failed' WHERE id = ${graphId}`
      return
    }

    const repo = await downloadAndExtractRepo(gitProvider, repoOrg, repoName, branch, accessToken)
    if (!repo?.codebasePath) {
      console.log('Failed to download repo')
      await sql`UPDATE graphs SET status = 'failed' WHERE id = ${graphId}`
      return
    }

    const codebase = new Codebase(repo?.codebasePath)
    const fileNodesMap = await codebase.parseFolder()
    codebase.getCalls(fileNodesMap, false)
    const nodes = codebase.simplify()

    // create a uuid for each node
    const nodeDBIds: {[key: string]: string} = {}
    for (const node of nodes) {
      nodeDBIds[node.id] = uuidv4()
    }

    // Insert nodes into the database, note that the node.id is now the full_name
    const insertNodePromises = nodes.map((node) => {
      return sql`
    INSERT INTO nodes (id, graph_id, type, language, total_tokens, documentation, code, code_no_body, in_degree, out_degree, full_name, label)
    VALUES (${nodeDBIds[node.id]}, ${graphId}, ${node.type}, ${node.language}, ${node.totalTokens}, ${node.documentation}, ${node.code}, ${node.codeNoBody}, ${node.inDegree}, ${node.outDegree}, ${node.id}, ${node.label})
    `
    })

    const links = codebase.getLinks()
    // Insert links into the database
    const insertLinkPromises = links.map((link) => {
      return sql`
    INSERT INTO links (node_source_id, node_target_id, graph_id, label)
    VALUES (${nodeDBIds[link.source]}, ${nodeDBIds[link.target]}, ${graphId}, ${link.label})
    `
    })

    await Promise.all(insertNodePromises)
    await Promise.all(insertLinkPromises)

    await sql`UPDATE graphs SET status = 'completed' WHERE id = ${graphId}`
    await sql`UPDATE repositories SET commit_hash = ${repo.commitSha} WHERE id = ${repoId}`
    console.log('Graph creation completed:', graphId)
  } catch (error) {
    console.error('Error in background processing:', error)
  }
}

export { createGraph }
