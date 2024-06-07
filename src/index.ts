import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import { createGraph } from './routes/create_graph'

// const
const app = new Hono()

app.use('*', prettyJSON())
app.use('/v1/*', cors())

// app.get('/', async (c) => {
//   console.time('codebase')
//   const codebasePath = path.join(__dirname, '../../api-vicuna-deno')
//   const codebase = new Codebase(codebasePath) //
//   const fileNodesMap = await codebase.parseFolder()
//   codebase.getCalls(fileNodesMap, true)
//   console.timeEnd('codebase')
//   const codebaseSimplified = codebase.simplify() //.filter(c => ['file'].includes(c.type))

//   // console.log(codebaseSimplified)
//   return c.text(JSON.stringify(codebaseSimplified, null, 2))

//   // return c.text(JSON.stringify(codebase.getLinks(), null, 2))
// })

app.route('/v1/repo', createGraph)

const port = 8001
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
