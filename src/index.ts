import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getAllFiles, getRequiredDefinitions, captureQuery, generateImports } from './model/utils'
import { languages } from './model/consts'
import Parser from 'tree-sitter'
// const 
const app = new Hono()

app.get('/', async (c) => {
  const code = `import pandas as pd`
  const imports = generateImports('py', code)
  console.log(imports)
  return c.json(imports)
})


const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
