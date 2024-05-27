import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getAllFiles } from './model/utils'
const app = new Hono()

app.get('/', async (c) => {
  const files = await getAllFiles('.')
  console.log(files)
  return c.text('Hello')
})


const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
