import fs from 'node:fs/promises';
import path from 'path';
import { Point } from 'tree-sitter'
import { captureQuery, cleanDefCaptures, getAllFiles, renameSource } from "./utils"
import {
    languageExtensionMap,
    AllowedTypesArray,
    AllowedTypes,
    newClassMethodsMap,
    treeSitterCommentTypes,
    indexSuffixesMap
} from "./consts"
import { runInThisContext } from 'node:vm';
import { language } from 'tree-sitter-javascript';
import node from 'tree-sitter-typescript';

export class ImportName {
    name: string = ''
    alias: string = ''
    subpath: string = ''
    
    constructor(name: string, alias?: string) {
        this.name = name
        this.alias  = alias || name
    }
}
export class ImportStatement {
    module: string = ''
    names: ImportName[] = []
    moduleAlias: string = ''
    code: string = ''
    path: string = ''
    startPosition: Point = {row: 0, column: 0}
    endPosition: Point = {row: 99999, column: 0}
}

interface Link {
    source: string
    target: string
    label: string
}

export class Node {
    id: string = '' // id is like /home/user/repo/file.extension::nodeName
    type: AllowedTypes = 'function'
    name: string = ''
    alias: string = ''
    language: string = ''
    importStatements: ImportStatement[] = [] // only for files
    totalTokens: number = 0
    documentation: string = ''
    code: string = ''
    body: string = ''
    exportable: boolean = false
    parent?: Node
    children: {[key: string]: Node} = {}
    calls: Node[] = []
    startPosition: Point = {row: 0, column: 0}
    endPosition: Point = {row: 99999, column: 0}
    inDegree: number = 0
    outDegree: number = 0

    constructor(id: string, code?: string, type?: AllowedTypes, language?: string) {
        this.id  = id
        this.code  = code || ''
        this.type  = type || 'function'
        this.language  = language || 'js'
    }

    addChild(child: Node) {
        // child -> this
        this.children[child.id] = child
        child.parent = this
        this.inDegree++
        child.outDegree++
    }

    removeChild(child: Node)  {
        if (Object.keys(this.children).includes(child.id)) {
            // child.parent = undefined
            delete this.children[child.id]
            this.inDegree--
            child.outDegree--
        }
     }

    addCall(node: Node){
        // this -> node
        this.calls.push(node)
        node.inDegree++
        this.outDegree++
    }

    addImportStatement(importStatement: ImportStatement) {
        this.importStatements.push(importStatement)
    }

    // Checks if this node is within another node
    isWithin(node: Node): boolean {
        return this.startPosition.row >= node.startPosition.row && this.endPosition.row <= node.endPosition.row
    }

    addNodeRelationship(node: Node) {
        if (this.isWithin(node) && (!this.parent ||  this.parent.type === 'file')) {
            if (node.type === 'export') {
                this.exportable = true
                if (!this.documentation) this.documentation = node.documentation
                return
            }

            const parentCode = node.code.replace(node.body, '')
            this.code = `${parentCode}\n${this.code}`
            if (this.parent?.type === 'file') {
            this.parent?.removeChild(this) // remove connection from previous parent
            node.addChild(this)
            }
            // Case for py, js and ts
            if (['class', 'interface'].includes(node.type) && this.type === 'function') {
                this.type = 'method'
                this.name = `${node.name}.${this.name}`
                this.id = `${this.id.split('::')[0]}::${this.name}`
                this.alias = this.name // methods has no alias
                return
            }
        }
    }

    propagateExportable() {
        if (this.exportable) {
            Object.keys(this.children).forEach(id => {
                this.children[id].exportable = true
                this.children[id].propagateExportable()
            })
        }
    }

    getCodeWithoutBody() {
        let code = this.code

        if (this.body) {
            if (Object.keys(this.children).length > 0) {
                // const extension = this.id.split('::')[0].split('.').pop() || '';
                const classMethodInit = newClassMethodsMap[this.language]
                Object.keys(this.children).forEach(id  => {
                    if (classMethodInit && this.type === 'class') {
                        // do not remove init methods
                        if (this.children[id].name?.endsWith(classMethodInit)) return

                        if (this.children[id].body) {
                            let bodyToRemove = this.children[id].body
                            bodyToRemove = bodyToRemove.replace(this.children[id].documentation, '')
                            const spaces = ' '.repeat(this.children[id].startPosition.column)
                            code = code.replace(bodyToRemove, `\n${spaces}    ...`)
                        }
                    }

                })
            } else {
                code = code.replace(this.body, "\n ...")
            }
        }
        return code.trim()
    }

    generateImports() {
        if (this.type !== 'file') return
        const captures = captureQuery(this.language, 'importStatements', this.code)
        captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
        // console.log({ captures: captures.map(c => {return {name : c.name, text : c.node.text}}) })
        const importStatements: ImportStatement[] = []
        let newImportStatement = new ImportStatement()
        let alias: string
        captures.forEach(c => {
            switch (c.name) {
                case 'alias':
                    alias = c.node.text
                    break
                case 'module':
                    newImportStatement.module = c.node.text
                    break
                case 'name':
                    const name = c.node.text
                    if (!alias) alias = name
                    const newImportName = new ImportName(name)
                    newImportStatement.names.push(newImportName)
                    alias = ''
                    break
                case 'import_statement':
                    if (alias && !newImportStatement.names) {
                        newImportStatement.moduleAlias = alias
                        alias = ''
                    } else {
                        newImportStatement.moduleAlias = newImportStatement.module
                    }
    
                    newImportStatement.path = renameSource(this.id, newImportStatement.module, this.language)
                    newImportStatement.code = c.node.text
                    newImportStatement.startPosition = c.node.startPosition
                    newImportStatement.endPosition = c.node.endPosition
                    importStatements.push(newImportStatement)
                    newImportStatement = new ImportStatement()
                    break;
            }
        })
        this.importStatements = importStatements.reverse()
    }

    parseExportClauses() {
        if (this.type !== 'file') return
        if (['javascript', 'typescript', 'tsx'].includes(this.language)) return
        const captures = captureQuery(this.language, 'exportClauses', this.code) 
        captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
        let name = ''
        let alias = ''
        captures.forEach(c => {
            switch (c.node.type) {
                case 'name':
                    name = c.node.text ?? ''
                    const node = this.children[`${this.id}::${name}`]
                    node.exportable = true
                    node.alias = alias? alias : name
                    name = ''
                    alias = ''
                    break
                case 'alias':
                    alias = c.node.text   
            }
        })
    
        if (name) {
            const node = this.children[`${this.id}::${name}`]
            node.exportable  = true
            node.alias  = alias? alias  : name
        }
    }
}


export class Codebase {
    rootFolderPath: string = ''
    nodesMap: { [id: string]: Node } = {}

    constructor(rootFolderPath: string)  { this.rootFolderPath  = rootFolderPath }
    addNode(node: Node) { this.nodesMap[node.id] = node; }
    getNode(id: string): Node | undefined { return this.nodesMap[id];  }
    addNodeMap(nodeMap: {[id: string]: Node})  { this.nodesMap  = {...this.nodesMap, ...nodeMap} }

    async GenerateNodesFromFilePath(filePath: string): Promise<{[id: string]: Node}> {
    
        const fileExtension  = filePath.split('.').pop()
        if (!fileExtension) return {}
        const data = await fs.readFile(filePath)
        const dataString = Buffer.from(data).toString()
        // Nodes are created using id, code, type, language
        const fileNode = new Node(filePath, dataString, 'file', languageExtensionMap[fileExtension])
        fileNode.name = filePath.split('/').pop()?.split('.').slice(-2)[0] || ''
        fileNode.alias = fileNode.name
        const unnecessaryNodeTypes = ['export'] // exclude it from the analysis
        const captures = captureQuery(fileNode.language, 'constructorDefinitions', fileNode.code)
        captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
        let exportable = ['python'].includes(fileNode.language) ? true : false
        const childrenNodes: Node[] = []
    
        captures.forEach((c)  => {
            if (AllowedTypesArray.includes(c.name as AllowedTypes)) {
                const newNode  = new Node(filePath, c.node.text, c.name as AllowedTypes, fileNode.language)
    
                newNode.startPosition  = c.node.startPosition
                newNode.endPosition  = c.node.endPosition
                newNode.exportable = exportable
                
                // In many languages the documentation is the prev sibling
                let prevTreeSitterNode = c.node.previousNamedSibling
                if (prevTreeSitterNode) { 
                    // if the previous node is a comment and it's in the previous line
                    if (treeSitterCommentTypes.includes(prevTreeSitterNode.type) &&
                    prevTreeSitterNode.endPosition.row === newNode.startPosition.row - 1) {
                        newNode.documentation  = prevTreeSitterNode.text
                    }
    
                }
                childrenNodes.push(newNode)
            }
        })
    
        childrenNodes.forEach((n, i) => {
            if (unnecessaryNodeTypes.includes(n.type)) return
            let code = n.code
            if (['javascript', 'typescript', 'tsx'].includes(fileNode.language)) {
                if (n.type === 'method' ) {
                    // Fix bug with methods
                    code = `function ${n.code}`
                    n.type = 'function'
                } else if (n.type === 'assignment') code = `const ${n.code}`
            }
            
            let captures = captureQuery(fileNode.language, 'definitionTemplate', code)
            // console.log(`/////${n.type}, ${fileNode.language}/////`)
            // console.log(`${n.code}`)
            // console.log('--------------')
            // console.log(captures.map(c => { return {name: c.name, text: c.node.text?.slice(0, 30)} }))
            captures = cleanDefCaptures(captures, 'name', 'body')
            // console.log(captures.map(c => { return {name: c.name, text: c.node.text?.slice(0, 30)} }))
            captures.forEach((c)  =>  {
                switch (c.name) {
                    case 'name':
                        n.name = c.node.text ?? ''
                        n.id = `${n.id}::${n.name}`
                        break
                    case 'alias':
                        n.alias  = c.node.text  ?? ''
                        break
                    case 'documentation':
                        n.documentation  = c.node.text  ?? ''
                        if (n.language === 'python') {
                            // remove doc from code
                            n.code = n.code.replace(n.documentation, '')
                        }
                        break
                    case 'body':
                        n.body  = c.node.text  ?? ''
                        break
                }
            })
            if (!n.alias) n.alias = n.name
    
            if (n.type === 'assignment') {
                // console.log(n)
                const assignmentCaptures = captureQuery(fileNode.language, 'extraAssignmentCode', n.code, n.name)
                assignmentCaptures.forEach((c)  =>  {
                    if (c.node.type === 'code') n.code += '\n\n' + c.node.text
                })
            }
        })
    
        childrenNodes.forEach((n, i) => {
            if (!unnecessaryNodeTypes.includes(n.type)) fileNode.addChild(n)
            for (let j = i+1; j < childrenNodes.length; j++) {
                n.addNodeRelationship(childrenNodes[j])
                childrenNodes[j].addNodeRelationship(n)
            }
        })
        
        // childrenNodes.sort((a,b) => a.startPosition.row - b.startPosition.row || a.startPosition.column  - b.startPosition.column)
        const nodesMap = childrenNodes.reduce<{[id: string]: Node}>((map, n)  =>  {
            if (!unnecessaryNodeTypes.includes(n.type)) map[n.id]  = n
            return map
        }, {})
        nodesMap[fileNode.id] = fileNode
        fileNode.parseExportClauses()
        fileNode.generateImports()
        return nodesMap
    }
    

    async parseFolder() {
        if (!this.rootFolderPath) return
        const fileNodeMap: {[id: string]: Node} = {}
        const allFiles = await getAllFiles(this.rootFolderPath)
        for (const filePath of allFiles) { // can't be forEach
            const nodeMap = await this.GenerateNodesFromFilePath(filePath)
            this.addNodeMap(nodeMap)
            const fileNode = nodeMap[filePath]
            fileNodeMap[filePath] = fileNode
            const suffix = indexSuffixesMap[fileNode.language]
            fileNode.importStatements.forEach((i)  =>  {
                for (const p in allFiles) {
                    const pathNoExtension = p.split('.').slice(0, -1).join('.')
                    if (pathNoExtension.endsWith(`${i.path}${suffix}`) || pathNoExtension.endsWith(i.path)) {
                        i.path = pathNoExtension
                        break
                    }
                    for (const importName of i.names) {
                        if (pathNoExtension.endsWith(`${i.path}/${importName.name}`)) {
                            const pathSplit =  pathNoExtension.split('/')
                            i.path = pathSplit.slice(0, -1).join('/')
                            importName.subpath = pathSplit.slice(-1)[0]
                            break
                        }
                        if (pathNoExtension.endsWith(`${i.path}/${importName.name}${suffix}`)) {
                            const pathSplit =  pathNoExtension.split('/')
                            i.path = pathSplit.slice(0, -2).join('/')
                            importName.subpath = pathSplit.slice(-2).join('/')
                            break
                        }
                    }
                }
                if (i.path.startsWith('@/')) i.path = path.join(this.rootFolderPath, i.path.slice(2))
            })
        }
    }

    simplyfy() {
        return Object.values(this.nodesMap).map( n => {
            return {
                id: n.id,
                type: n.type,
                name: n.name,
                alias: n.alias,
                language: n.language,
                exportable: n.exportable,
                totalTokens: n.totalTokens,
                documentation: n.documentation,
                code: n.code,
                // body: n.body,
                codeNoBody: n.getCodeWithoutBody(),
                parent: n.parent?.id,
                children: Object.keys(n.children),
                calls: n.calls.map(c => c.id),
                inDegree: n.inDegree,
                outDegree: n.outDegree
            }
        })

    }
}


