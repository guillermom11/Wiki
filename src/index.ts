import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Codebase, Node } from './model/codebase'

// const 
const app = new Hono()

app.get('/', async (c) => {
  const codebase = new Codebase('/home/pudu/MISC/judini/codebase-index-ts/src/model')
  await codebase.parseFolder()
  const data = codebase.nodesMap
  Object.keys(data).forEach(id => { 
    const childrenNames = data[id].children.map(child  =>  child.name)
    console.log(`ID: ${id}(${data[id].type}), childrenNames: ${childrenNames}`)
  })
  // return c.json(data)
})


const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
