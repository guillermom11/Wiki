import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import { createGraph } from './routes/create_graph'
import { createGraphTest } from './routes/create_graph-test'
import { graphs } from './routes/graphs'

// const
const app = new Hono()

app.use('*', prettyJSON())
app.use('/v1/*', cors())

app.get('/', async (c) => {
  return c.json({ message: 'Hello, World!' }, {status: 200})
})

app.route('/v1/repo', createGraph)
app.route('/v1/graphs', graphs)
app.route('v1/repo-test', createGraphTest)

const port = Number(process.env.PORT ?? 8001) 
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})