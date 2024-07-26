import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { GraphLink, GraphNode, sql } from '../utils/db'
import { downloadAndExtractRepo, getAccessToken, getCommitRepo } from '../utils/git'
import { Codebase } from '../model/codebase'
import { jwtVerify } from 'jose'
import { getEnv } from '../utils/utils'
import { GitServiceType } from '../utils/git'
import { generateAndUpdateDocumentation } from '../wiki/wiki'
const secret = getEnv('SUPABASE_JWT')

const repoRequestValidator = zValidator(
  'json',
  z.object({
    git_provider: z.enum(['github', 'gitlab', 'bitbucket']),
    repo_org: z.string(),
    repo_name: z.string(),
    branch: z.string(),
    connection_id: z.string(),
    gitlab_repo_id: z.number().optional(),
    generate_documentation: z.boolean().optional()
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
    connection_id: connectionId,
    gitlab_repo_id: gitlabRepoId,
    generate_documentation: generateDocBool
  } = request

  const jwt = c.req.header('Authorization')?.split('Bearer ')[1]

  if (!jwt) {
    return c.json(
      {
        message: 'Unauthorized'
      },
      401
    )
  }

  const { payload } = await jwtVerify(jwt, new TextEncoder().encode(secret))
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

  const tokens = await getAccessToken(gitProvider, connectionId, userOrgId)

  if (!tokens) {
    console.log('Failed to get access token')
    return c.json({ message: 'Failed to get access token' }, 500)
  }

  const { accessToken, refreshToken } = tokens

  const commitHash = await getCommitRepo(
    gitProvider,
    repoOrg,
    repoName,
    branch,
    accessToken,
    refreshToken,
    connectionId,
    gitlabRepoId
  )
  if (!commitHash) {
    console.log('Failed to get commit')
    return c.json({ message: 'Failed to get commit' }, 500)
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
        AND commit_hash = ${commitHash}
    `

  let repoId = crypto.randomUUID()

  if (rows.length == 0) {
    const respository: Record<string, string | number> = {
      id: repoId,
      git_provider: gitProvider,
      repo_org: repoOrg,
      repo_name: repoName,
      branch: branch,
      commit_hash: commitHash
    }

    if (gitProvider === 'gitlab' && gitlabRepoId) respository.gitlab_repo_id = gitlabRepoId

    const res = await sql`INSERT INTO repositories ${sql([respository])}`

    if (!res) {
      console.log('Failed to create repository')
      return c.json({ message: 'Failed to create repository' }, 500)
    }
  } else {
    repoId = rows[0].id
  }

  const graphUsersData = await sql`
    SELECT g.org_id, g.user_id
    FROM nodes n -- must have at least one node
    LEFT JOIN repositories r 
      ON n.repo_id = r.id
    LEFT JOIN graphs g
      ON g.repo_id = n.repo_id
    WHERE
      n.repo_id = ${repoId}
      AND r.git_provider = ${gitProvider}
      AND r.commit_hash = ${commitHash}`

  let graphExists = false

  // graph already exists with that commit
  if (graphUsersData.length > 0) {
    const orgIds = graphUsersData.map((row) => row.org_id)
    const userIds = graphUsersData.map((row) => row.user_id)
    // the user and org already have this graph
    if (orgIds.includes(userOrgId) && userIds.includes(userId)) {
      console.log('Graph already exists')
      return c.json({ message: 'Graph already exists' }, 500)
    }
    graphExists = true
  }

  try {
    const codebasePath = await downloadAndExtractRepo(
      gitProvider,
      repoOrg,
      repoName,
      branch,
      accessToken,
      commitHash,
      gitlabRepoId
    )
    // Perform background task
    processGraphCreation({
      gitProvider,
      repoId,
      userOrgId,
      userId,
      graphExists,
      connectionId,
      codebasePath,
      repoName,
      generateDocBool
    })

    return c.json({ message: 'Graph creation started' })
  } catch (error: any) {
    return c.json({ message: error.message }, 500)
  }
})

async function processGraphCreation({
  gitProvider,
  repoId,
  userOrgId,
  userId,
  graphExists,
  connectionId,
  codebasePath,
  repoName,
  generateDocBool
}: {
  gitProvider: GitServiceType
  repoId: string
  userOrgId: string
  userId: string
  graphExists: boolean
  connectionId: string
  codebasePath: string
  repoName: string
  generateDocBool?: boolean
}) {
  let graphId = crypto.randomUUID()
  try {
    const status = graphExists ? 'completed' : 'pending'

    // graph does not exist
    if (!codebasePath) {
      console.log('Failed to download repo')
      return
    }

    const graph: Record<string, string | number> = {
      id: graphId,
      repo_id: repoId,
      status,
      org_id: userOrgId,
      user_id: userId
    }

    if (gitProvider === 'github') graph.github_connection_id = Number(connectionId)
    else if (gitProvider === 'gitlab') graph.gitlab_connection_id = Number(connectionId)
    else if (gitProvider === 'bitbucket') graph.bitbucket_connection_id = connectionId

    await sql`INSERT INTO graphs ${sql([graph])}`

    if (graphExists) {
      console.log('Graph creation completed:', graphId)
      return
    }

    const codebase = new Codebase(codebasePath)
    const fileNodesMap = await codebase.parseFolder()
    codebase.getCalls(fileNodesMap, false)
    const nodes = codebase.simplify()

    const nodeDBIds: Record<string, string> = {}

    const set = new Set()
    for (const node of nodes) {
      set.add(node.id)
      nodeDBIds[node.id] = crypto.randomUUID()
    }

    if (set.size !== nodes.length) {
      console.log('Duplicate nodes found for graph creation with id:', graphId)
      return
    }

    // Insert nodes into the database, note that the node.id is now the full_name
    const insertNodePromises = nodes.map((node) => {
      const fullName = node.id
      return sql`
          INSERT INTO nodes (
            id,
            repo_id,
            type,
            language,
            total_tokens,
            documentation,
            code,
            code_no_body,
            in_degree,
            out_degree,
            full_name,
            label,
            origin_file,
            import_statements
          )
          VALUES (
            ${nodeDBIds[node.id]},
            ${repoId},
            ${node.type},
            ${node.language},
            ${node.totalTokens},
            ${node.documentation},
            ${node.code},
            ${node.codeNoBody},
            ${node.inDegree},
            ${node.outDegree},
            ${fullName},
            ${node.label},
            ${node.originFile},
            ${node.importStatements.join('\n')}
          )
        `
    })

    const links = codebase.getLinks()
    // Insert links into the database
    const insertLinkPromises = links.map((link) => {
      return sql`
        INSERT INTO links (
          node_source_id,
          node_target_id,
          repo_id,
          label,
          line
        ) VALUES (
          ${nodeDBIds[link.source]},
          ${nodeDBIds[link.target]},
          ${repoId},
          ${link.label},
          ${link.line}
        )
      `
    })

    const folderNames = nodes.map(n => n.originFile.split('/').slice(0, -1).join('/'))
    const uniqueFolderNames = [...new Set(folderNames)]
    const insertFolderPromises = uniqueFolderNames.map((folderName) => {
      return sql`
        INSERT INTO graph_folders (
          repo_id,
          name
        ) VALUES (
          ${repoId},
          ${folderName}
        )
      `
    })

    await Promise.all([...insertNodePromises, ...insertLinkPromises, ...insertFolderPromises])

    
    if (generateDocBool) {

      const graphNodes: GraphNode[] = nodes.map(n => {
        return {
          id: nodeDBIds[n.id],
          fullName: n.id,
          type: n.type,
          language: n.language,
          documentation: n.documentation,
          code: n.code,
          codeNoBody: n.codeNoBody,
          totalTokens: 0,
          inDegree: 0,
          outDegree: 0,
          label: n.label,
          originFile: n.originFile,
          generatedDocumentation: '',
          importStatements: n.importStatements.join('\n')
          }
      })

      const graphLinks: GraphLink[] = links.map(l => {
          return {
              id: '0',
              source: nodeDBIds[l.source],
              target: nodeDBIds[l.target],
              label: l.label,
              line: l.line
          }
      } )
      await generateAndUpdateDocumentation(repoName, repoId, graphNodes, graphLinks)
    }
 



    await sql`UPDATE graphs SET status = 'completed' WHERE id = ${graphId}`
    console.log('Graph creation completed:', graphId)
  } catch (error) {
    console.error('Error in background processing:', error)
    await sql`UPDATE graphs SET status = 'failed' WHERE id = ${graphId}`
  }
}

export { createGraph }
