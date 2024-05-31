import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import {
  Codebase,
  // Node
} from './model/codebase'
// import { CallsCapturer } from './model/calls'
// import node from 'tree-sitter-typescript'
// import fs from 'node:fs/promises';

// const 
const app = new Hono()
app.use('/v1/*', cors())

const repoRequestValidator = zValidator(
  'json',
  z.object({
    user: z.string().optional(),
    repo: z.string(),
    branch: z.string().optional(),
    token: z.string().optional(),
    update: z.boolean().optional()
  })
)

app.get('/', async (c) => {
  console.time('codebase')
  const codebase = new Codebase('../codebase-index-ts') // 
  const fileNodesMap = await codebase.parseFolder()
  codebase.getCalls(fileNodesMap, false)
  console.timeEnd('codebase')
  const codebaseSimplified = codebase.simplify().filter(c => ['file'].includes(c.type))

  // console.log(codebaseSimplified)
  return c.text(JSON.stringify(codebaseSimplified, null, 2))

  return c.text(JSON.stringify(codebase.getLinks(), null, 2))
})

app.post('/v1/repo', repoRequestValidator, async (c) => {
  const request = c.req.valid('json')
  const { user, repo, branch, token, update } = request
  // console.log(request)
  console.time(repo)
  const codebase = new Codebase(`../${repo}`) // 
  const fileNodesMap = await codebase.parseFolder()
  codebase.getCalls(fileNodesMap, false)
  const nodes = codebase.simplify()
  const links = codebase.getLinks()
  console.timeEnd(repo)
  return c.json({ codebase: {},  graph: { nodes, links } })

})



const port = 8001
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
