import fs from 'node:fs/promises';
import { Point } from 'tree-sitter'
import {
    captureQuery,
    getAllFiles,
    renameSource,
    getCalledNode,
    getNodesDefinitionsFromFileNode,
    resolveImportStatementsPath
} from "./utils"
import {
    languageExtensionMap,
    AllowedTypes,
    newClassMethodsMap,
} from "./consts"
import { CallsCapturer } from './calls';

export class ImportName {
    name: string = ''
    alias: string = ''
    // subpath: string = ''
    
    constructor(name: string, alias?: string) {
        this.name = name
        this.alias  = alias || name
    }
}
export class ImportStatement {
    module: string = ''
    names: ImportName[] = []
    moduleAlias: string = ''
    path: string = ''
    // code: string = ''
    // startPosition: Point = {row: 0, column: 0}
    // endPosition: Point = {row: 99999, column: 0}
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
                Object.values(this.children).forEach(n  => {
                    if (classMethodInit && this.type === 'class') {
                        // do not remove init methods
                        if (n.name?.endsWith(classMethodInit)) return

                        if (n.body) {
                            let bodyToRemove = n.body
                            bodyToRemove = bodyToRemove.replace(n.documentation, '')
                            const spaces = ' '.repeat(n.startPosition.column)
                            code = code.replace(bodyToRemove, `\n${spaces}    ...`)
                        }
                    } else if (this.type === 'file' && !['assignment', 'type', 'enum'].includes(n.name)) {
                        if (n.body) {
                            let bodyToRemove = n.body
                            bodyToRemove = bodyToRemove.replace(n.documentation, '')
                            const spaces = ' '.repeat(n.startPosition.column)
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
                // case 'submodule':
                //     break
                // case 'wildcard':
                //     break
                case 'import_statement':
                    if (alias && !newImportStatement.names) {
                        newImportStatement.moduleAlias = alias
                        alias = ''
                    } else {
                        newImportStatement.moduleAlias = newImportStatement.module
                    }
    
                    newImportStatement.path = renameSource(this.id, newImportStatement.module, this.language)
                    // newImportStatement.code = c.node.text
                    // newImportStatement.startPosition = c.node.startPosition
                    // newImportStatement.endPosition = c.node.endPosition
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

    async generateNodesFromFilePath(filePath: string): Promise<{[id: string]: Node}> {
        const fileExtension  = filePath.split('.').pop()
        if (!fileExtension) return {}
        const data = await fs.readFile(filePath)
        const dataString = Buffer.from(data).toString()
        // Nodes are created using id, code, type, language
        const filePathNoExtension = filePath.split('.').slice(0, -1).join('.')
        const fileNode = new Node(filePathNoExtension, dataString, 'file', languageExtensionMap[fileExtension])
        fileNode.name = filePath
        fileNode.alias = filePathNoExtension.split('/').pop() || ''
        const nodesMap = getNodesDefinitionsFromFileNode(fileNode)
        fileNode.parseExportClauses()
        fileNode.generateImports()
        nodesMap[fileNode.id] = fileNode
        return nodesMap
    }
    

    async parseFolder(): Promise<{[id: string]: Node}> {
        if (!this.rootFolderPath) return {}
        const fileNodeMap: {[id: string]: Node} = {}
        const allFiles = await getAllFiles(this.rootFolderPath)
        for (const filePath of allFiles) { // can't be forEach
            const nodeMap = await this.generateNodesFromFilePath(filePath)
            this.addNodeMap(nodeMap)
            const filePathNoExtension = filePath.split('.').slice(0, -1).join('.')
            const fileNode = nodeMap[filePathNoExtension]
            fileNodeMap[filePathNoExtension] = fileNode
            resolveImportStatementsPath(fileNode, this.rootFolderPath, allFiles)
        }
        return fileNodeMap 
    }

    getCalls(fileNodeMap: {[id: string]: Node}, verbose: boolean = false) {
        const allFilePaths = Object.keys(fileNodeMap).sort()
        Object.keys(fileNodeMap).forEach(fileId => {
            const fileNode = fileNodeMap[fileId]
            if (Object.values(fileNode.children).length === 0) {
                if (verbose) console.log(`File ${fileId} has no children`)
                return
            }
            const callsCapturer = new CallsCapturer(fileNode.language, fileNode.importStatements, verbose)
            const importedFiles: {[key: string]: Node} = {} 

            // Point import statements to their respective File objects
            fileNode.importStatements.forEach(i => {
                for (const filePath of allFilePaths) {
                    let fileFound = false
                    if (i.names) {
                        for (const importName of i.names) {
                            if (filePath.endsWith(`${i.path}/${importName.alias}`)) {
                                importedFiles[`${i.path}/${importName.alias}`] = fileNodeMap[filePath]
                                fileFound = true
                                break
                            }
                        }
                    }
                    if (fileFound) break

                    if (filePath.endsWith(i.path)) {
                        importedFiles[i.path] = fileNodeMap[filePath]
                        break
                    }
                }
            })
            Object.values(this.nodesMap).forEach(n => {
                const code = Object.keys(n.children).length > 0 ? n.getCodeWithoutBody() : n.code
                const calls = callsCapturer.getCallsFromCode(code, n.name)
                const importFromFailed: Set<string> = new Set()
                calls.forEach(c => {
                    if (importFromFailed.has(c.importFrom)) return
                    const calledNode = getCalledNode(c.name, c.importFrom, importedFiles, fileNode)
                    if (calledNode) {
                        n.calls.push(calledNode)
                        n.outDegree++
                        calledNode.inDegree++
                    } else {
                        if (verbose && c.importFrom) console.log(`Failed to add call for node ${n.id}: ${c.name} not found in ${c.importFrom}`)
                        importFromFailed.add(c.importFrom)
                    }
                })
            })
        })
    }

    simplify() {
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
                // code: n.code,
                // body: n.body,
                ImportStatements: n.importStatements,
                // codeNoBody: n.getCodeWithoutBody(),
                parent: n.parent?.id,
                children: Object.keys(n.children),
                calls: n.calls.map(c => c.id),
                inDegree: n.inDegree,
                outDegree: n.outDegree
            }
        })

    }
}


