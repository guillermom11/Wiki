import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getAllFiles, getRequiredDefinitions, captureQuery, generateImports, GenerateNodesFromFile } from './model/utils'
import { languages } from './model/consts'
import Parser from 'tree-sitter'
// const 
const app = new Hono()

app.get('/', async (c) => {

  const data = await GenerateNodesFromFile("/home/pudu/MISC/judini/codebase-index-ts/src/model/codebase.ts")
  Object.keys(data).forEach(key => { 
    const childrenNames = data[key].children.map(child  =>  child.name)
    console.log(`ID: ${key} name: ${data[key].name}, range: ${data[key].startPosition.row}:${data[key].endPosition.row} childrenNames: ${childrenNames}`)
  })
  // return c.json(data)
})


const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
