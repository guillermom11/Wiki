import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Codebase, Node } from './model/codebase'
import { CallsCapturer } from './model/calls'

// const 
const app = new Hono()

app.get('/', async (c) => {
  // const codebase = new Codebase('/home/pudu/MISC/judini/codebase-index-ts/src/model')
  // await codebase.parseFolder()
  // const data = codebase.nodesMap
  // Object.keys(data).forEach(id => { 
  //   const childrenNames = data[id].children.map(child  =>  child.name)
  //   console.log(`ID: ${id}(${data[id].type}), childrenNames: ${childrenNames}`)
  // })
  // return c.json(data)

  const callsCapturer = new CallsCapturer('typescript', [], true)
  const calls = callsCapturer.getCallsFromCode(`
  const captures  = captureQuery(this.language, 'calls', code)
  captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row || a.node.startPosition.column - b.node.startPosition.column)
  const results: CallIdentifier[]  = []
  const nodesSeen: Set<string> = new Set()
  captures.forEach(c => {
      let content = c.node.text
      const startLine = c.node.startPosition.row
      const endLine = c.node.endPosition.row
      if (nodesSeen.has(nodeIdenfier)) return
      nodesSeen.add(nodeIdenfier)
      if (["identifier.name", "parameter_type", "return_type"].includes(c.name)) {
          for ( const c in validateContent(content)) {
              let importFrom
              const contentSplit = c.split('____')
              if (contentSplit.length > 1) {
                  importFrom  = contentSplit.slice(0, -1).join('/')
                  importFrom = importFrom.replace(/__SPACE__/g, ' ').replace(/__DASH__/g, '-')
              }
              let callName = contentSplit.slice(-1)[0]
              results.push(new CallIdentifier(callName, startLine, importFrom ?? ''))

              if (callName.includes('.')) {
                  const callNameSplit = callName.split('.')
                  const _importFrom = callNameSplit[0]
                  callName = callNameSplit.slice(1).join('.')
                  results.push(new CallIdentifier(callName, startLine, importFrom))
              }
          }
      }
  })

  `) 
console.log(calls)
})


const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
