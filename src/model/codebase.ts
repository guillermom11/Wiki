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
    node?: Node
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
    code?: string

    constructor(module: string = '', names: ImportName[] = [], path: string = '', moduleAlias?: string, code?: string) {
        this.module = module
        this.names = names
        this.moduleAlias = moduleAlias || module
        this.path = path
        this.code = code
    }
}

interface Link {
    source: string
    target: string
    label: string
    line: number
}

type NodeCallTuple = {node: Node, lines: number[]} // nodeId, first line

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
    calls: NodeCallTuple[] = []
    startPosition: Point = {row: 0, column: 0}
    endPosition: Point = {row: 99999, column: 0}
    inDegree: number = 0
    outDegree: number = 0
    // originFile is the file where the node is defined
    originFile: string = ''

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

    getAllChildren(parentTypes?: AllowedTypes[]): Node[] {
        // get childrens recursively
        const children: Node[] = []
        if (parentTypes && !parentTypes.includes(this.type)) return []
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

    addCall(node: Node, lines: number[] = []){
        // this -> node
        this.calls.push({node, lines})
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

    getCodeWithoutBody(considerLines: boolean = false) {
        let code = this.code

        if ((this.body || this.type === 'file') && !['assignment', 'type', 'enum'].includes(this.type)) {
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
                            let bodyTotalLines = considerLines ? bodyToRemove.split('\n').length : 1
                            if (this.language === 'python') {
                                code = code.replace(bodyToRemove, `\n${spaces}    ...` + '\n'.repeat(Math.max(bodyTotalLines- 1, 0)))
                            } else {
                                code = code.replace(bodyToRemove, `{\n${spaces}    //...\n${spaces}}` + '\n'.repeat(Math.max(bodyTotalLines - 3, 0)))
                            }
                        }
                    } else if (this.type === 'file' && !['assignment', 'type', 'enum'].includes(n.type)) {
                        if (n.body) {
                            let bodyToRemove = n.body
                            bodyToRemove = bodyToRemove.replace(n.documentation, '')
                            let bodyTotalLines = considerLines ? bodyToRemove.split('\n').length : 1
                            const spaces = ' '.repeat(n.startPosition.column)
                            if (this.language === 'python') {
                                code = code.replace(bodyToRemove, `${spaces}...` + '\n'.repeat(Math.max(bodyTotalLines - 1, 0)))
                            } else {
                                code = code.replace(bodyToRemove, `{\n${spaces}//...\n${spaces}}`  + '\n'.repeat(Math.max(bodyTotalLines - 3, 0)))
                            }

                        }
                    }
                })

            } else if (this.body) {
                const spaces = ' '.repeat(this.startPosition.column)
                let bodyTotalLines = considerLines ? this.body.split('\n').length : 1
                if (this.language === 'python') {
                    code = code.replace(this.body, `${spaces}...` + '\n'.repeat(Math.max(bodyTotalLines - 1, 0)))
                } else {
                    code = code.replace(this.body, `{\n${spaces}//...\n${spaces}}`  + '\n'.repeat(Math.max(bodyTotalLines - 3, 0)))
                }

                
            }
        }
        code = considerLines? code: code.trim().replace(/\n\s*\n/, '\n')
        if (this.parent && ['class', 'interface'].includes(this.parent?.type)) {
            if (considerLines) {
                const bodyTotalLines = considerLines ? this.parent.body.split('\n').length : 1
                code = `${this.parent.code.replace(this.parent.body, '')}` + '\n'.repeat(Math.max(bodyTotalLines - 3, 0)) + `\n    ...\n    ${code}`
            } else {
                code = `${this.parent.code.replace(this.parent.body, '').trim()}\n    ...\n    ${code}`
            }
            
            
        }
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
                    newImportStatement.code = c.node.text.trimEnd()
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
        // In some cases the import statement is related to index files such as index.ts or __init__.py
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
        if (!['file', 'header'].includes(this.type)) return {}
        const unnecessaryNodeTypes = ['export'] // exclude it from the analysis
        const captures = captureQuery(this.language, 'constructorDefinitions', this.code)
        captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
        let exportable = ['python', 'php'].includes(this.language) ? true : false
        let childrenNodes: Node[] = []
    
        captures.forEach((c)  => {
            if (AllowedTypesArray.includes(c.name as AllowedTypes)) {
                const newNode  = new Node(this.id, c.node.text, c.name as AllowedTypes, this.language)
    
                newNode.startPosition  = c.node.startPosition
                newNode.endPosition  = c.node.endPosition
                newNode.exportable = exportable
                newNode.originFile = this.name
                
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
                    case 'modifier': // java, php only
                        if (['php', 'java'].includes(n.language) && c.node.text.includes('public')) n.exportable = true
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

        // find "package" or "namespace"
        let spaceNode = null
        if (['java', 'php'].includes(this.language)) {
            const captures = captureQuery(this.language, 'spaceDeclaration', this.code)
            captures.forEach(c => {
                switch (c.name) {
                    case 'spaceName':
                        const spaceName = c.node.text
                        const initialLine = c.node.startPosition.row
                        const type = 'java' == this.language ? 'package' : 'namespace'
                        spaceNode = new Node(`${this.id}::${spaceName}`, this.code.split('\n').slice(initialLine, -1).join('\n'), type, this.language)
                        spaceNode.name = spaceName
                        spaceNode.alias = spaceName
                        spaceNode.exportable = true
                        break
                }
            })
        }

        if (spaceNode) childrenNodes.push(spaceNode)
    
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
            importStatements: this.importStatements.map(i => i.code),
            parent: this.parent?.id,
            children: Object.keys(this.children),
            calls: this.calls.map(c => c.node.id),
            inDegree: this.inDegree,
            outDegree: this.outDegree,
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
    // an space can be defined in multiples files (for example namespaces in C#)
    spaceMap: {[spaceName: string]: Node[]} = {}

    constructor(rootFolderPath: string)  { this.rootFolderPath  = rootFolderPath }
    addNode(node: Node) { this.nodesMap[node.id] = node; }
    getNode(id: string): Node | undefined { return this.nodesMap[id];  }
    addNodeMap(nodeMap: {[id: string]: Node}) { this.nodesMap  = {...this.nodesMap, ...nodeMap} }
    addNodeToSpaceMap(node: Node) { 
        if (!this.spaceMap[node.name]) this.spaceMap[node.name] = []
         this.spaceMap[node.name].push(node)
    }

    async generateNodesFromFilePath(filePath: string): Promise<{nodesMap: {[id: string]: Node}, isHeader: boolean}> {
        const fileExtension  = filePath.split('.').pop()
        if (!fileExtension) return {nodesMap : {}, isHeader: false}
        const data = await fs.readFile(filePath)
        const dataString = Buffer.from(data).toString()
        // Nodes are created using id, code, type, language. The id does not include the extension
        const filePathNoExtension = filePath.split('.').slice(0, -1).join('.')
        
        let fileNode
        let isHeader = false
        // Special case: .h files (headers)
        if (fileExtension === 'h') {
            fileNode = new Node(`${filePathNoExtension}::header`, dataString, 'header', languageExtensionMap[fileExtension])
            isHeader = true
        } else {
            fileNode = new Node(filePathNoExtension, dataString, 'file', languageExtensionMap[fileExtension])
        }
        fileNode.name = filePath
        fileNode.alias = filePath.split('/').pop() || ''
        const nodesMap = fileNode.getChildrenDefinitions()
        fileNode.generateImports()
        fileNode.parseExportClauses(this.nodesMap)
        nodesMap[fileNode.id] = fileNode

        
        Object.values(nodesMap).forEach(n => {
            // get tokens
            n.totalTokens = enc.encode(n.code, 'all', []).length
            // save space nodes
            if (['namespace', 'package', 'mod'].includes(n.type)) this.addNodeToSpaceMap(n)
        })

        return {nodesMap, isHeader}
    }

    resolveSpaces() {
        const globalSpaceMap: {[spaceName: string]: Node[]} = {}
        Object.entries(this.spaceMap).forEach(([spaceName, nodes]) => {
            const globalNode = new Node(`${spaceName}`, '', nodes[0].type, nodes[0].language)
            globalNode.name = spaceName
            globalNode.alias = spaceName
            globalNode.parent = nodes[0].parent
            // globalNode.originFile = nodes[0].originFile
            nodes.forEach(n => {
                globalNode.code += n.code + '\n\n'
                for (const c of n.getAllChildren()) {
                    const oldId = c.id
                    delete this.nodesMap[oldId]
                    c.id = `${spaceName}::${c.name}`
                    if (c.parent && ['file', 'package', 'mod', 'namespace'].includes(c.parent.type))
                        globalNode.addChild(c)
                        
                    this.nodesMap[c.id] = c
                }
                if (n.parent) {
                    this.nodesMap[n.parent.id].removeChild(n)
                    // add it to parent without changing the parent
                    this.nodesMap[n.parent.id].children[globalNode.id] = globalNode
                    this.nodesMap[n.parent.id].inDegree++
                    delete this.nodesMap[n.id]
                    this.nodesMap[globalNode.id] = globalNode
                }
            })
            globalSpaceMap[spaceName] = [globalNode]
        })

        this.spaceMap = globalSpaceMap
        
    }
    

    async parseFolder(): Promise<{[id: string]: Node}> {
        if (!this.rootFolderPath) return {}
        const fileNodesMap: {[id: string]: Node} = {}
        const allFiles = await getAllFiles(this.rootFolderPath)
        for (const filePath of allFiles) { // can't be forEach
            let id = filePath.split('.').slice(0, -1).join('.')
            try {
                const { nodesMap, isHeader } = await this.generateNodesFromFilePath(filePath)
                this.addNodeMap(nodesMap)
                id = isHeader ? `${id}::header` : id
                const fileNode = nodesMap[id]
                fileNodesMap[id] = fileNode
                fileNode.resolveImportStatementsPath(this.rootFolderPath, allFiles)
            } catch (error: any) {
                console.log(`Cannot parse file Id ${id}`)
                console.log(error.message)
                throw error
            }
        }
        // python special case
        this.resolvePythonInitImportStatements()
        this.resolveSpaces()
        this.resolveImportStatementsNodes()
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
            const nodes: Node[] = [fileNode , ...fileNode.getAllChildren()]
            nodes.forEach((n: Node) => {
                const callNodeIds = callsCapturer.getCallsFromNode(n)
                // const importFromFailed: Set<string> = new Set()
                // console.log( `### ${n.id}`)
                // console.log(n.code)
                // console.log(calls)
                Object.entries(callNodeIds).forEach(([nodeId, lines]) => {
                    // if (importFromFailed.has(c.importFrom)) return
                    const calledNode = this.nodesMap[nodeId]
                    if (calledNode && !['package', 'mod', 'namespace'].includes(calledNode.type)) {
                        // console.log({calledNode: calledNode.id, type: calledNode.type})
                        n.addCall(calledNode, lines) // first line
                        // console.log(`Added call from ${n.id} to ${calledNode.id}`)
                    } else {
                        if (verbose) console.log(`Failed to add call for node ${n.id}: ${nodeId} (line ${lines}) not found`)
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
                // const label = n.parent.type === 'file' ? `defines`: `from ${n.parent.type}`
                const label = 'defines'
                links.push({source: n.parent.id, target: n.id, label, line: n.startPosition.row + 1})
            }
            if (n.calls.length > 0) n.calls.forEach(c => links.push({source: n.id, target: c.node.id, label: 'calls', line: c.lines[0] + 1}))
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

    resolveImportStatementsNodes() {
        const nodes = Object.values(this.nodesMap)
        nodes.forEach(n => {
            if (!['file', 'header'].includes(n.type) ) return
            n.importStatements.forEach(i => {
                i.names.forEach(n => {
                    n.node = this.nodesMap[`${i.path}::${n.name}`] || this.nodesMap[`${i.module}::${n.name}`]
                })
                const namesIds = i.names.map(n => n.node?.id || '')
                namesIds.forEach(id => {
                    this.nodesMap[id]?.getAllChildren(['file', 'class', 'interface', 'mod', 'namespace', 'package']).forEach(c => {
                        const newName = new ImportName(c.alias, c.alias)
                        newName.node = c
                        i.names.push(newName)
                    })
                })
                if (['c', 'cpp'].includes(n.language)) {
                    const headerNode = this.nodesMap[i.path]
                    if (headerNode) {
                        this.resolveHeaderC(n, headerNode)
                    }
                }  
                // cases like import *, #define "file", etc.
                if (i.names.length === 0) {
                    this.nodesMap[i.path]?.getAllChildren(['file', 'class', 'interface', 'mod', 'namespace', 'header']).forEach(c => {
                        const newName = new ImportName(c.alias, c.alias)
                        newName.node = c
                        i.names.push(newName)
                    })
                    this.nodesMap[i.module]?.getAllChildren(['file', 'class', 'interface', 'mod', 'namespace', 'header']).forEach(c => {
                        const newName = new ImportName(c.alias, c.alias)
                        newName.node = c
                        i.names.push(newName)
                    })
                }
                
            })
        })
    }

    resolveHeaderC(fileNode: Node, headerNode: Node) {
        if ( headerNode.type !== 'header' || !['c', 'cpp'].includes(headerNode.language)) return
        const childIds = headerNode.getAllChildren().map(c => c.id)
        childIds.forEach(id => {
            const nodeRef = fileNode.getAllChildren().find(c => c.id === id.replace('::header', ''))
            // nodeRef is the headerNode.children[id] but already defined
            if (nodeRef) {
                // remove that node
                delete this.nodesMap[id]
                headerNode.removeChild(headerNode.children[id])
                // headerNode.addChild(nodeRef)
                // add it to headerNode without changing the parent
                headerNode.children[nodeRef.id] = nodeRef
                headerNode.inDegree++
            }
        })
    }

}


