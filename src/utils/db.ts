import { AllowedTypes } from '../model/consts'
import { getEnv } from './utils'
import postgres from 'postgres'

export const sql = postgres({
  host: getEnv('DATABASE_HOST'),
  database: getEnv('DATABASE_NAME'),
  port: Number(getEnv('DATABASE_PORT')),
  user: getEnv('DATABASE_USERNAME'),
  password: getEnv('DATABASE_PASSWORD'),
  prepare: false,
  connect_timeout: 60,
  idle_timeout: 60,
  ssl: {
    ca: getEnv('SUPABASE_CA_CERTIFICATE')
  }
  // ssl: {
  //   rejectUnauthorized: false
  // }
})


export interface GraphNode {
  id: string
  fullName: string
  type: AllowedTypes
  language: string
  documentation?: string
  code: string
  codeNoBody: string
  totalTokens: number
  inDegree: number
  outDegree: number
  label: string
  originFile?: string
  generatedDocumentation?: string
  importStatements?: string
}

export interface GraphLink {
  id: string
  source: string
  target: string
  label: string
  line?: number
}

export async function getGraphNodesById({
  userOrgId,
  graphId,
}: {
  userOrgId: string
  graphId: string
}): Promise<GraphNode[]> {
  try {
    const rows = await sql<GraphNode[]>`
      SELECT
        n.id,
        n.full_name AS fullName,
        n.type as,
        n.language,
        n.documentation,
        n.code,
        n.code_no_body AS codeNoBody,
        n.total_tokens AS totalTokens,
        n.in_degree AS inDegree,
        n.out_degree AS outDegree,
        n.label,
        n.origin_file AS originFile,
        n.generated_documentation AS generatedDocumentation,
        n.import_statements AS importStatements
      FROM graphs g
      JOIN repositories r
        ON r.id = g.repo_id
      JOIN nodes n
        ON n.repo_id = r.id
      WHERE g.id = ${graphId}
        AND g.org_id = ${userOrgId}
        AND g.status = 'completed'
    `

    return rows
  } catch (error) {
    console.log('Error getting graph nodes by id', error)
    return []
  }
}

export async function getGraphLinksById({
  userOrgId,
  graphId,
}: {
  userOrgId: string
  graphId: string
}): Promise<GraphLink[]> {
  try {
    const rows = await sql<GraphLink[]>`
      SELECT
        l.id,
        l.node_source_id AS source,
        l.node_target_id AS target,
        l.label,
        l.line
      FROM graphs g
      JOIN repositories r
        ON r.id = g.repo_id
      JOIN links l
        ON l.repo_id = r.id
      WHERE g.id = ${graphId}
        AND g.org_id = ${userOrgId}
        AND g.status = 'completed'
    `

    return rows
  } catch (error) {
    console.log('Error getting graph links by id', error)
    return []
  }
}