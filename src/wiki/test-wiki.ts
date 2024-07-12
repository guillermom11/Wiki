import { fstat } from "fs";
import { Codebase } from "../model/codebase";
import { GraphLink, GraphNode } from "../utils/db";
import { generateDocumentation } from "./wiki";
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'

(async () => {

    const codebasePath = '/home/pudu/MISC/judini/codebase-index-ts/'
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
        fullName: n.id.replace(codebasePath, ''),
        type: n.type,
        language: n.language,
        documentation: n.documentation,
        code: n.code,
        codeNoBody: n.codeNoBody,
        totalTokens: 0,
        inDegree: 0,
        outDegree: 0,
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

    
    const documentedFolders = await generateDocumentation(grapNodes, graphLinks, 'codebase-index-ts')
    
    fs.writeFile("./grapNodes.json", JSON.stringify(grapNodes, null, 2))
    fs.writeFile("./graphLinks.json", JSON.stringify(graphLinks, null, 2))
    fs.writeFile("./graphFolders.json", JSON.stringify(documentedFolders, null, 2))
})()