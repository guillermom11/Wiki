import fs from 'node:fs/promises';
import { Point } from 'tree-sitter'
import {
    captureQuery,
    getAllFiles,
    renameSource,
    getCalledNode,
    cleanDefCaptures
} from "./utils"
import {
    languageExtensionMap,
    AllowedTypes,
    newClassMethodsMap,
    indexSuffixesMap,
    AllowedTypesArray,
    treeSitterCommentTypes
} from "./consts"
import { CallsCapturer } from './calls';
import path from 'path'
import {  encoding_for_model } from "tiktoken";
const enc = encoding_for_model("gpt-4-turbo");

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
    module: string
    names: ImportName[]
    moduleAlias: string
    path: string
    // code: string = ''
    // startPosition: Point = {row: 0, column: 0}
    // endPosition: Point = {row: 99999, column: 0}

    constructor(module: string = '', names: ImportName[] = [], path: string = '', moduleAlias?: string) {
        this.module = module
        this.names = names
        this.moduleAlias = moduleAlias || module
        this.path = path
    }
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

    getChild(childId: string): Node | undefined {
        // recursive search over children, only if is a file
        if (this.children[childId]) {
            return this.children[childId]
        } else if ( this.type === 'file') {
            for (const child of Object.values(this.children)) {
                const result = child.getChild(childId)
                if (result) return result
            }
        }
        return
    }

    getAllChildren(): Node[] {
        // get childrens recursively
        const children: Node[] = []
        for (const child of Object.values(this.children)) {
            children.push(child)
            children.push(...child.getAllChildren())
        }
        return children
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
        // if (node.type === this.type && node.name === this.name) return
        if (this.isWithin(node) && !this.parent) {
            if (node.type === 'export') { // in js, ts the export clause is parent
                this.exportable = true
                if (!this.documentation) this.documentation = node.documentation
                return
            }
            if (this.type === 'export') return // export are not added as nodes

            // const parentCode = node.code.replace(node.body, '')
            // this.code = `${parentCode}\n${this.code}`
            
            // Case for py, js and ts
            if (['class', 'interface'].includes(node.type) && this.type === 'function') {
                this.type = 'method'
                this.name = `${node.name}.${this.name}`
                this.alias = this.name // methods has no alias
            }
            this.id = `${this.id.split('::')[0]}::${this.name}`
            node.addChild(this)
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

        if (this.body || this.type === 'file') {
            if (Object.keys(this.children).length > 0) {
                // const extension = this.id.split('::')[0].split('.').pop() || '';
                const classMethodInit = this.language !== 'java' ? newClassMethodsMap[this.language] : this.name
                Object.values(this.children).forEach(n  => {
                    if (classMethodInit && this.type === 'class') {
                        // do not remove init methods
                        if (n.name?.endsWith(classMethodInit)) return

                        if (n.body) {
                            let bodyToRemove = n.body
                            bodyToRemove = bodyToRemove.replace(n.documentation, '')
                            const spaces = ' '.repeat(n.startPosition.column)
                            if (this.language === 'python') {
                                code = code.replace(bodyToRemove, `\n${spaces}    ...`)
                            } else {
                                code = code.replace(bodyToRemove, `{\n${spaces}    //...\n${spaces}}`)
                            }
                        }
                    } else if (this.type === 'file' && !['assignment', 'type', 'enum'].includes(n.type)) {
                        if (n.body) {
                            let bodyToRemove = n.body
                            bodyToRemove = bodyToRemove.replace(n.documentation, '')
                            const spaces = ' '.repeat(n.startPosition.column)
                            if (this.language === 'python') {
                                code = code.replace(bodyToRemove, `${spaces}...`)
                            } else {
                                code = code.replace(bodyToRemove, `{\n${spaces}//...\n${spaces}}`)
                            }

                        }
                    }
                })

            } else {
                const spaces = ' '.repeat(this.startPosition.column)
                if (this.language === 'python') {
                    code = code.replace(this.body, '').trim() + `\n${spaces}    ...`
                } else {
                    code = code.replace(this.body, '').trim() + `{\n${spaces}    //...\n${spaces}}`
                }

                
            }
        }
        code = code.trim().replace(/\n\s*\n/, '\n')
        if (this.parent && ['class', 'interface'].includes(this.parent?.type))
            code = `${this.parent.code.replace(this.parent.body, '').trim()}\n    ...\n    ${code}`
        return code
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
                    const newImportName = new ImportName(name, alias)
                    newImportStatement.names.push(newImportName)
                    alias = ''
                    break
                // case 'submodule':
                //     break
                // case 'wildcard':
                //     break
                case 'import_statement':
                    if (alias && newImportStatement.names.length === 0) {
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

    parseExportClauses(nodesMap: {[id: string]: Node} = {}) {
        // only js, ts have the "export { ... }" clause
        if (!['javascript', 'typescript', 'tsx'].includes(this.language)) return
        const captures = captureQuery(this.language, 'exportClauses', this.code) 
        captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
        let name = ''
        let alias = ''
        let moduleName = this.id
        captures.forEach(c => {
            switch (c.name) {
                case 'module':
                    moduleName = path.join(this.id.split('/').slice(0, -1).join('/'), c.node.text)
                case 'alias':
                    alias = c.node.text
                    break
                case 'name':
                    name = c.node.text
                    // the name is imported
                    const importedName = this.importStatements.filter(i => i.names.map(n => n.alias).includes(name))[0]
                    if (importedName) moduleName = importedName.path
                    const node = this.children[`${this.id}::${name}`] || nodesMap[`${moduleName}::${name}`]
                    if (node) {
                        node.exportable = true
                        node.alias = alias? alias : name
                        // if the export clause includes an alias, then we have to update the id
                        // since this is used to resolve imports and get calls 
                        node.id = `${this.id}::${node.alias}`

                        // the node is exported from the same file 
                        if (moduleName === this.id) {
                            delete this.children[`${this.id}::${name}`]
                            this.children[node.id] = node
                            const childrenNodes = Object.values(node.children)
                            childrenNodes.forEach(n => {
                                n.alias = n.name.replace(name, alias)
                                delete node.children[n.id]
                                n.id = `${this.id}::${n.alias}`
                                node.children[n.id] = n
                            })
                        
                        // it's using export { ... } from 'file'
                        }
                        // } else {
                        //     node.exportable = true
                        //     node.alias = alias? alias : name
                        //     // add the node to the file node
                        //     node.id = `${this.id}::${node.alias}`
                        //     this.children[node.id] = node
                        // }

                    } 
                    // else {
                    //     console.log(`Export clause ${name} not found in ${this.id}`)
                    // }
            }
        })
    }

    resolveImportStatementsPath(rootFolderPath: string, allFiles: string[]) {
        if (this.type !== 'file') return
        const suffix = indexSuffixesMap[this.language];
        const fileSet = new Set(allFiles.map(p => p.split('.').slice(0, -1).join('.')));
        
        this.importStatements.forEach((importStatement) => {
            const possiblePaths = [
                ...importStatement.names.map(name => path.resolve(`${rootFolderPath}/${importStatement.path}/${name.name}${suffix}`)),
                ...importStatement.names.map(name => path.resolve(`${rootFolderPath}/${importStatement.path}/${name.name}`)),
                ...importStatement.names.map(name => path.resolve(`${importStatement.path}/${name.name}${suffix}`)),
                ...importStatement.names.map(name => path.resolve(`${importStatement.path}/${name.name}`)),
                path.resolve(`${rootFolderPath}/${importStatement.path}${suffix}`),
                path.resolve(`${rootFolderPath}/${importStatement.path}`),
                path.resolve(`${importStatement.path}${suffix}`),
                path.resolve(importStatement.path)
            ];
    
            for (const possiblePath of possiblePaths) {
                if (fileSet.has(possiblePath)) {
                    importStatement.path = possiblePath
                    break;
                }
            }
    
            if (importStatement.path.startsWith('@/')) {
                importStatement.path = path.join(rootFolderPath, importStatement.path.slice(2));
            }
        });
    }

    getChildrenDefinitions(): {[id: string]: Node}{
        if (this.type !== 'file') return {}
        const unnecessaryNodeTypes = ['export'] // exclude it from the analysis
        const captures = captureQuery(this.language, 'constructorDefinitions', this.code)
        captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
        let exportable = ['python'].includes(this.language) ? true : false
        let childrenNodes: Node[] = []
    
        captures.forEach((c)  => {
            if (AllowedTypesArray.includes(c.name as AllowedTypes)) {
                const newNode  = new Node(this.id, c.node.text, c.name as AllowedTypes, this.language)
    
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

                // In python the decorator is the prev sibling
                if (this.language === 'python') {
                    prevTreeSitterNode = c.node.previousSibling
                    if (prevTreeSitterNode) { 
                        if (['decorator'].includes(prevTreeSitterNode.type) &&
                        prevTreeSitterNode.endPosition.row === newNode.startPosition.row - 1) {
                            // include the decorator
                            newNode.code = prevTreeSitterNode.text + '\n' + newNode.code
                        }
                    }
                }
            }
        })
    
        childrenNodes.forEach(n => {
            // if (unnecessaryNodeTypes.includes(n.type)) return
            let code = n.code
            if (['javascript', 'typescript', 'tsx'].includes(this.language)) {
                if (n.type === 'method' ) {
                    // Fix bug with methods
                    code = `function ${n.code}`
                    n.type = 'function'
                } else if (n.type === 'assignment') code = `const ${n.code}`
            } else if (['java'].includes(this.language)) {
                if (n.type == 'function') {
                    const firstLine = code.split('(')[0]
                    const firstLineSplit = firstLine.split(' ')
                    // if has no return type, add void between modifier and name
                    if (firstLineSplit.length !== 3) {
                        code = code.replace(firstLine, `${firstLineSplit[0]} void ${firstLineSplit.slice(-1)[0]}`)
                    }
                }
            }
            
            let captures = captureQuery(this.language, 'definitionTemplate', code)
            // console.log(`/////${n.type}, ${n.language}/////`)
            // console.log(`${code}`)
            // console.log('--------------')
            // console.log(captures.map(c => { return {name: c.name, text: c.node.text?.slice(0, 30), start: c.node.startPosition, end: c.node.endPosition } }))
            captures = cleanDefCaptures(captures, n.language === 'java' ? 'modifier' : 'name')
            // console.log(captures.map(c => { return {name: c.name, text: c.node.text?.slice(0, 60), start: c.node.startPosition, end: c.node.endPosition } }))
            captures.forEach((c)  =>  {
                switch (c.name) {
                    case 'modifier': // java only
                        if (n.language == 'java' && c.node.text.includes('public')) n.exportable = true
                        break
                    case 'name':
                        n.name = c.node.text
                        n.id = `${n.id}::${n.name}`
                        break
                    case 'alias':
                        n.alias  = c.node.text
                        break
                    case 'documentation':
                        n.documentation = c.node.text
                        if (n.language === 'python') {
                            n.code = n.code.replace(n.documentation, '')
                            n.body = n.body.replace(n.documentation, '')
                        }
                        break
                    case 'body':
                        n.body  = c.node.text
                        break
                }
            })
            if (!n.alias) n.alias = n.name
    
            if (n.type === 'assignment') {
                const assignmentCaptures = captureQuery(this.language, 'extraAssignmentCode', this.code, n.name)
                // console.log(assignmentCaptures.map(c => { return {name: c.name, text: c.node.text?.slice(0, 60), start: c.node.startPosition, end: c.node.endPosition } }))
                assignmentCaptures.forEach((c)  =>  {
                    if (c.name === 'code') n.code += '\n' + c.node.text
                })
            }
        })
    
        // must have a name
        childrenNodes = childrenNodes.filter(c => c.name)
    
        childrenNodes.forEach((n, i) => {
            for (let j = i+1; j < childrenNodes.length; j++) {
                n.addNodeRelationship(childrenNodes[j])
                childrenNodes[j].addNodeRelationship(n)
            }
            if (!unnecessaryNodeTypes.includes(n.type) && !n.parent) this.addChild(n)
        })
    
        // childrenNodes.sort((a,b) => a.startPosition.row - b.startPosition.row || a.startPosition.column  - b.startPosition.column)
        const nodesMap = childrenNodes.reduce<{[id: string]: Node}>((map, n)  =>  {
            if (!unnecessaryNodeTypes.includes(n.type)) map[n.id]  = n
            return map
        }, {})
        return nodesMap
    }

    simplify(attributes: string[] = []) {
        const allAttributes: { [key: string]: any } = {
            id: this.id,
            type: this.type,
            name: this.name,
            label: this.alias,
            language: this.language,
            exportable: this.exportable,
            totalTokens: this.totalTokens,
            documentation: this.documentation,
            code: this.parent && ['class', 'interface'].includes(this.parent?.type)  ? `${this.parent.code.replace(this.parent.body, '').trim()}\n    ...\n    ${this.code}` : this.code,
            codeNoBody: this.getCodeWithoutBody(),
            importStatements: this.importStatements.map(i => i.path),
            parent: this.parent?.id,
            children: Object.keys(this.children),
            calls: this.calls.map(c => c.id),
            inDegree: this.inDegree,
            outDegree: this.outDegree
        };
    
        if (attributes.length === 0) {
            return allAttributes;
        }
    
        return attributes.reduce((acc: { [key: string]: any }, attr: string) => {
            if (allAttributes.hasOwnProperty(attr)) {
                acc[attr] = allAttributes[attr];
            }
            return acc;
        }, {});
    }
}


export class Codebase {
     // NOTE: rootFolderPath should be an absolute path
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
         // The id does not include the extension
        const fileNode = new Node(filePathNoExtension, dataString, 'file', languageExtensionMap[fileExtension])
        fileNode.name = filePath
        fileNode.alias = filePath.split('/').pop() || ''
        const nodesMap = fileNode.getChildrenDefinitions()
        fileNode.generateImports()
        fileNode.parseExportClauses(this.nodesMap)
        nodesMap[fileNode.id] = fileNode

        // get tokens
        Object.values(nodesMap).forEach(n => n.totalTokens = enc.encode(n.code, 'all', []).length)

        return nodesMap
    }
    

    async parseFolder(): Promise<{[id: string]: Node}> {
        if (!this.rootFolderPath) return {}
        const fileNodesMap: {[id: string]: Node} = {}
        const allFiles = await getAllFiles(this.rootFolderPath)
        for (const filePath of allFiles) { // can't be forEach
            try {
                const nodeMap = await this.generateNodesFromFilePath(filePath)
                this.addNodeMap(nodeMap)
                const filePathNoExtension = filePath.split('.').slice(0, -1).join('.')
                const fileNode = nodeMap[filePathNoExtension]
                fileNodesMap[filePathNoExtension] = fileNode
                fileNode.resolveImportStatementsPath(this.rootFolderPath, allFiles)
            } catch (error: any) {
                console.log(`Cannot parse file ${filePath}`)
                console.log(error.message)
                throw error
            }
        }
        // python special case
        this.resolvePythonInitImportStatements()
        return fileNodesMap 
    }

    getCalls(fileNodesMap: {[id: string]: Node}, verbose: boolean = false) {
        Object.keys(fileNodesMap).forEach(fileId => {
            const fileNode = fileNodesMap[fileId]
            if (Object.values(fileNode.children).length === 0) {
                if (verbose) console.log(`File ${fileId} has no children`)
                return
            }
            const callsCapturer = new CallsCapturer(fileNode, verbose)
            const importedFiles: {[key: string]: Node} = {} 

            // Point import statements to their respective File objects
            // console.log(`---- ${fileNode.id} ----`)
            fileNode.importStatements.forEach(i => {
                if (Object.keys(fileNodesMap).includes(i.path)) {
                    importedFiles[i.path]  = fileNodesMap[i.path]
                }
            })

            importedFiles[fileNode.id] = fileNode

            const nodes: Node[] = [fileNode , ...fileNode.getAllChildren()]
            nodes.forEach((n: Node) => {
                const calls = callsCapturer.getCallsFromNode(n)
                // const importFromFailed: Set<string> = new Set()
                // console.log( `### ${n.id}`)
                // console.log(calls)
                calls.forEach(c => {
                    // if (importFromFailed.has(c.importFrom)) return
                    const calledNode = getCalledNode(c.name, c.importFrom, importedFiles)
                    if (calledNode) {
                        n.calls.push(calledNode)
                        n.outDegree++
                        calledNode.inDegree++
                        // console.log(`Added call from ${n.id} to ${calledNode.id}`)
                    } else {
                        if (verbose) console.log(`Failed to add call for node ${n.id}: ${c.name} (line ${c.lines}) not found in ${c.importFrom}`)
                        // importFromFailed.add(c.importFrom)
                    }
                })
            })
        })
    }

    simplify(attributes: string[] = []) {
        return Object.values(this.nodesMap).map( n => n.simplify(attributes))

    }

    getLinks(): Link[] {
        const links: Link[] = []
        const nodes = Object.values(this.nodesMap)
        for (const n of nodes){
            if (n.parent) {
                const label = n.parent.type === 'file' ? `defines`: `from ${n.parent.type}`
                links.push({source: n.parent.id, target: n.id, label })
            }
            if (n.calls.length > 0) n.calls.forEach(c => links.push({source: n.id, target: c.id, label: 'calls'}))
        }
        return links
    }

    resolvePythonInitImportStatements() {
        // THIS IS A TEMPORARY FIX
        // In many cases, the __init__.py file just contains the import statements for the other files
        const nodes = Object.values(this.nodesMap)
        nodes.forEach(n => {
            if (n.type !== 'file' || n.language !== 'python') return
            let newImportStatements: ImportStatement[] = [...n.importStatements]
            n.importStatements.forEach(i => {
                if (i.path.endsWith('__init__')) {
                    newImportStatements = newImportStatements.filter(s => s.path != i.path)
                    newImportStatements = [...this.nodesMap[i.path].importStatements, ...newImportStatements]
                }
            })
            n.importStatements = newImportStatements
        })
    }

}


