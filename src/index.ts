import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { Codebase } from './model/codebase'
// import { tursoClient } from './db/client'
import { downloadAndExtractRepo } from './gitutils'
import path from 'path'
// const
const app = new Hono()
app.use('/v1/*', cors())

const repoRequestValidator = zValidator(
  'json',
  z.object({
    gitService: z.enum(['github', 'gitlab', 'bitbucket']),
    user: z.string(),
    repo: z.string(),
    branch: z.string(),
    token: z.string(),
    update: z.boolean().optional()
  })
)

app.get('/', async (c) => {
  console.time('codebase')
  const codebasePath = path.join(__dirname, '../../api-vicuna-deno')
  const codebase = new Codebase(codebasePath) //
  const fileNodesMap = await codebase.parseFolder()
  codebase.getCalls(fileNodesMap, true)
  console.timeEnd('codebase')
  const codebaseSimplified = codebase.simplify() //.filter(c => ['file'].includes(c.type))

  // console.log(codebaseSimplified)
  return c.text(JSON.stringify(codebaseSimplified, null, 2))

  // return c.text(JSON.stringify(codebase.getLinks(), null, 2))
})

app.post('/v1/repo', repoRequestValidator, async (c) => {
  const request = c.req.valid('json')
  const { gitService, user, repo, branch, token } = request
  // console.log(request)
  console.time(repo)
  const codebasePath = await downloadAndExtractRepo(gitService, user, repo, branch, token)
  // tursoClient.execute({
  //   sql: `INSERT INTO git_repositories (git_service, user, repo, branch, token, update) VALUES (:gitService, :user, :repo, :branch, :token, :update)`,
  //   args: {
  //     gitService,
  //     user,
  //     repo,
  //     branch,
  //     token,
  //     update
  //   }
  // })
  if (!codebasePath) return c.json({ message: 'Failed to download repo' }, 400)
  const codebase = new Codebase(codebasePath) //
  const fileNodesMap = await codebase.parseFolder()
  codebase.getCalls(fileNodesMap, false)
  const nodes = codebase.simplify()
  const links = codebase.getLinks()
  console.timeEnd(repo)
  return c.json({ graph: { nodes, links } })
})

app.get('v1/test', async (c) => {
  const codebasePath = await downloadAndExtractRepo(
    'github',
    'JudiniLabs',
    'judini-python',
    'main',
    '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'
  )

  if (!codebasePath) return c.json({ message: 'Failed to download repo' }, 400)

  const codebase = new Codebase(codebasePath)
  const fileNodesMap = await codebase.parseFolder()
  codebase.getCalls(fileNodesMap, false)
  const nodes = codebase.simplify()
  const links = codebase.getLinks()
  return c.json({ graph: { nodes, links } })
})

// /**
//  * CREATE TURSO DATABASE
//  *
//  */
// import { createClient } from "@libsql/client";
// export const turso = createClient({
//   url: process.env.TURSO_DATABASE_URL || '',
//   authToken: process.env.TURSO_AUTH_TOKEN || '',
// });

// (async () => {
//   console.log('Updating DB...')
//   await turso.execute("PRAGMA foreign_keys = ON")

//   await turso.execute(`
//   CREATE TABLE IF NOT EXISTS git_repositories (
//     id TEXT PRIMARY KEY DEFAULT (uuid()),
//     git_service TEXT CHECK(git_service IN ('github', 'gitlab', 'bitbucket')) NOT NULL,
//     user TEXT NOT NULL,
//     repo TEXT NOT NULL,
//     branch TEXT NOT NULL,
//     commit_id TEXT,
//     status TEXT CHECK(status IN ('pending', 'success', 'failure')) DEFAULT 'pending'
// )
// `)

// await turso.execute(`
// CREATE TABLE IF NOT EXISTS nodes (
//   nid TEXT PRIMARY KEY DEFAULT (uuid()),
//   id TEXT NOT NULL,
//   git_repositories_id TEXT NOT NULL,
//   commit_id TEXT,
//   type TEXT,
//   name TEXT,
//   label TEXT,
//   language TEXT,
//   exportable BOOLEAN,
//   totalTokens INTEGER,
//   documentation TEXT,
//   code TEXT,
//   import_statements JSON DEFAULT('[]'),
//   parent TEXT,
//   children JSON DEFAULT('[]'),
//   calls JSON DEFAULT('[]'),
//   inDegree INTEGER,
//   outDegree INTEGER,
//   FOREIGN KEY (git_repositories_id) REFERENCES git_repositories(id)
// )`)

// await turso.execute(`
// CREATE TABLE IF NOT EXISTS links (
//   lid TEXT PRIMARY KEY DEFAULT (uuid()),
//   source TEXT NOT NULL,
//   target TEXT NOT NULL,
//   label TEXT,
//   FOREIGN KEY (source) REFERENCES nodes(nid),
//   FOREIGN KEY (target) REFERENCES nodes(nid)
// )
// `)
// })()

const port = 8001
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
