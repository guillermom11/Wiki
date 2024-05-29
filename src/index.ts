import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Codebase, Node } from './model/codebase'
import { CallsCapturer } from './model/calls'
import node from 'tree-sitter-typescript'
import fs from 'node:fs/promises';

// const 
const app = new Hono()

app.get('/', async (c) => {
  console.time('codebase')
  const codebase = new Codebase('/home/pudu/MISC/judini/judini-python')
  const fileNodesMap = await codebase.parseFolder()
  codebase.getCalls(fileNodesMap, false)
  console.timeEnd('codebase')
  const codebaseSimplified = codebase.simplify()
  
  // console.log(codebaseSimplified)
  return c.text(JSON.stringify(codebaseSimplified, null, 2))
})


const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
