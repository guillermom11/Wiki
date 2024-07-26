import { Hono } from 'hono'
import { getGraphFolderById, getGraphLinksById, getGraphNodesById, GraphLink, GraphNode, sql } from '../utils/db'
import { getEnv } from '../utils/utils'
import { jwtVerify } from 'jose'
import { GitServiceType, downloadAndExtractRepo, getAccessToken, getCommitRepo } from '../utils/git'
import { Codebase } from '../model/codebase'
import { v4 as uuidv4 } from 'uuid'
import { generateAndUpdateDocumentation } from '../wiki/wiki'

const graphs = new Hono()

graphs.patch('/:id', async (c) => {
  try {
    const jwt = c.req.header('Authorization')?.split('Bearer ')[1]

    if (!jwt) {
      return c.json(
        {
          error: 'Unauthorized'
        },
        401
      )
    }

    const { payload } = await jwtVerify(jwt, new TextEncoder().encode(getEnv('SUPABASE_JWT')))

    const userId = payload.sub

    if (!userId) {
      return c.json(
        {
          error: 'Unauthorized'
        },
        401
      )
    }

    const graphId = c.req.param('id')
    const generateDocBool = Boolean(c.req.query('generate_documentation')) || false

    const graph = await sql`
      SELECT
        r.git_provider,
        r.repo_org,
        r.repo_name,
        r.branch,
        r.commit_hash,
        r.gitlab_repo_id,
        g.github_connection_id,
        g.gitlab_connection_id,
        g.bitbucket_connection_id,
        p.org_sel_id,
        r.has_autowiki
      FROM profiles p
      JOIN graphs g ON g.org_id = p.org_sel_id
      JOIN repositories r ON g.repo_id = r.id
      WHERE p.id = ${userId}
        AND g.id = ${graphId}
    `

    if (graph.length === 0) {
      return c.json(
        {
          error: 'Graph not found'
        },
        404
      )
    }

    const {
      org_sel_id: userOrgId,
      git_provider: gitProvider,
      repo_org: repoOrg,
      repo_name: repoName,
      commit_hash: repoCommitHash,
      branch,
      gitlab_repo_id: gitlabRepoId,
      github_connection_id,
      gitlab_connection_id,
      bitbucket_connection_id,
      has_autowiki: hasAutoWiki
    } = graph[0]

    const connections: Record<string, string | number> = {
      github: github_connection_id,
      gitlab: gitlab_connection_id,
      bitbucket: bitbucket_connection_id
    }

    const connectionId = String(connections[gitProvider])

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
      return c.json({ error: 'Failed to get commit' }, 400)
    }

    if (commitHash === repoCommitHash) {
      if (generateDocBool && !hasAutoWiki) {
        updateGraphDocumentation({
          gitProvider,
          repoOrg,
          repoName,
          branch,
          commitHash,
          userOrgId,
          graphId
        })
      } else {
        return c.json({ message: 'Graph already up to date' }, 200)
      }
    }

    await sql`
      UPDATE graphs 
      SET 
        status = 'updating'
      WHERE id = ${graphId}
    `

    const rows = await sql`
      SELECT 
        id
      FROM repositories
      WHERE git_provider = ${gitProvider}
        AND repo_org = ${repoOrg}
        AND repo_name = ${repoName}
        AND branch = ${branch}
        AND commit_hash = ${commitHash}
    `

    if (rows.length > 0) {
      await sql`
        UPDATE graphs 
        SET 
          status = 'completed',
          repo_id = ${rows[0].id}
        WHERE id = ${graphId}
      `

      return c.json({ message: 'Graph updated' }, 200)
    }

    updateGraph({
      gitProvider,
      repoOrg,
      repoName,
      branch,
      accessToken,
      commitHash,
      gitlabRepoId,
      graphId,
      generateDocBool
    })

    return c.json({ message: 'Graph updating' }, 200)
  } catch (error) {
    console.log('Error updating graph', error)
    return c.json({ error: 'Error updating graph' }, 500)
  }
})

interface UpdateGraph {
  gitProvider: GitServiceType
  repoOrg: string
  repoName: string
  branch: string
  accessToken: string
  commitHash: string
  gitlabRepoId?: number
  graphId: string
  generateDocBool: boolean
}


interface UpdateGraphDocumentation {
  gitProvider: GitServiceType
  repoOrg: string
  repoName: string
  branch: string
  commitHash: string
  userOrgId: string
  graphId: string
}

async function updateGraphDocumentation({
  gitProvider,
  repoOrg,
  repoName,
  branch,
  commitHash,
  userOrgId,
  graphId
}: UpdateGraphDocumentation) {
  try {
    const rows = await sql`
    SELECT 
      id
    FROM repositories
    WHERE git_provider = ${gitProvider}
      AND repo_org = ${repoOrg}
      AND repo_name = ${repoName}
      AND branch = ${branch}
      AND commit_hash = ${commitHash}
    `
    if (rows.length > 0) {
        const repoId = rows[0].id

        const graphNodes = await getGraphNodesById({userOrgId, graphId})
        const graphLinks = await getGraphLinksById({userOrgId, graphId})
        if (graphNodes.length > 0 && graphLinks.length > 0 ) {
          await generateAndUpdateDocumentation(repoName, repoId, graphNodes, graphLinks)
        }
    }
  }  catch (error) {
    console.error('Error in background processing:', error)
  }

  console.log(`Documentation for Graph ${graphId} updated`)
}

async function updateGraph({
  gitProvider,
  repoOrg,
  repoName,
  branch,
  accessToken,
  commitHash,
  gitlabRepoId,
  graphId,
  generateDocBool
}: UpdateGraph) {
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

    if (!codebasePath) {
      console.log('Failed to download repo')
      await sql`UPDATE graphs SET status = 'failed' WHERE id = ${graphId}`
      return
    }

    const respository: Record<string, string | number> = {
      git_provider: gitProvider,
      repo_org: repoOrg,
      repo_name: repoName,
      branch: branch,
      commit_hash: commitHash
    }

    if (gitProvider === 'gitlab' && gitlabRepoId) respository.gitlab_repo_id = gitlabRepoId

    const res = await sql`INSERT INTO repositories ${sql([respository])} RETURNING id`

    if (res.length === 0) {
      console.log('Failed to create repository')
      await sql`UPDATE graphs SET status = 'failed' WHERE id = ${graphId}`
      return
    }

    const repoId = res[0].id

    const codebase = new Codebase(codebasePath)
    const fileNodesMap = await codebase.parseFolder()
    codebase.getCalls(fileNodesMap, false)
    const nodes = codebase.simplify()

    const nodeDBIds: { [key: string]: string } = {}

    for (const node of nodes) {
      nodeDBIds[node.id] = uuidv4()
    }

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
        ) VALUES (
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

    if(generateDocBool) {
      
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

    await sql`
      UPDATE graphs 
      SET 
        status = 'completed',
        repo_id = ${repoId}
      WHERE id = ${graphId}`
  } catch (error) {
    console.error('Error in background processing:', error)
    await sql`UPDATE graphs SET status = 'failed' WHERE id = ${graphId}`
  }

  console.log(`Graph ${graphId} updated`)
}

export { graphs }
