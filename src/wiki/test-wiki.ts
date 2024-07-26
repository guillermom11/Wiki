
import { Codebase } from "../model/codebase";

import { GraphLink, GraphNode } from "../utils/db";
import { generateDocumentation } from "./wiki";
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'

(async () => {

    // const codebasePath = '/home/pudu/MISC/judini/codebase-index-ts/'
    const repoName = 'judini-python'
    const codebasePath = `/home/pudu/MISC/judini/${repoName}/`
    const codebase = new Codebase(codebasePath)
    console.log('Parsing folders ..')
    const fileNodesMap = await codebase.parseFolder()
    console.log('Getting calls ..')
    codebase.getCalls(fileNodesMap, false)
    const nodes = codebase.simplify()

    // create a uuid for each node
    const nodeDBIds: { [key: string]: string } = {}
    for (const node of nodes) {
      nodeDBIds[node.id] = uuidv4()
    }


    const grapNodes: GraphNode[] = nodes.map(n => {
        
        return {
        id: nodeDBIds[n.id],
        fullName: n.id,
        type: n.type,
        language: n.language,
        documentation: n.documentation,
        code: n.code,
        codeNoBody: n.codeNoBody,
        totalTokens: 0,
        inDegree: n.inDegree,
        outDegree: n.outDegree,
        label: n.label,
        originFile: n.originFile,
        generatedDocumentation: '',
        importStatements: n.importStatements.join('\n')
        }
    })

    const links = codebase.getLinks()

    const graphLinks: GraphLink[] = links.map(l => {
        return {
            id: uuidv4(),
            source: nodeDBIds[l.source],
            target: nodeDBIds[l.target],
            label: l.label,
            line: l.line
        }
    } )

    const model = 'gpt-4o-mini' 
    // const model = 'gpt-4o'
    
    const documentedFolders = await generateDocumentation(grapNodes, graphLinks, repoName, model)

    const modelNoDots = model.replace(/\./g, '-')
    
    fs.writeFile(`./graphNodes-${repoName}-${modelNoDots}.json`, JSON.stringify(grapNodes, null, 2))
    // fs.writeFile("./graphLinks.json", JSON.stringify(graphLinks, null, 2))
    fs.writeFile(`./graphFolders-${repoName}-${modelNoDots}.json`, JSON.stringify(documentedFolders, null, 2))
})()