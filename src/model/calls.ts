import { cleanAndSplitContent, captureQuery } from "./utils"
import { ImportStatement, Node } from "./codebase"
import { itselfClassMap } from "./consts"
import path from "path"

class VariableAssignment {
    left: string = ''
    right: string = ''
    startLine: number = 0
    endLine: number = 99999
}

class CallIdentifier {
    name: string
    line: number = 0
    importFrom: string

    constructor(name: string, line: number, importFrom: string) {
        this.name = name
        this.line = line
        this.importFrom = importFrom
    }
}

class Call {
    importFrom: string
    name: string
    lines: number[]

    constructor(importFrom: string, name: string, lines: number[] = []) {
        this.importFrom = importFrom
        this.name = name
        this.lines = lines
    }
}
export class CallsCapturer {
    fileNode: Node
    verbose: boolean = true

    constructor(fileNode: Node, verbose: boolean = false) {
        this.fileNode = fileNode
        this.verbose = verbose
    }

    captureAssignments(code: string): VariableAssignment[] {
        const captures = captureQuery(this.fileNode.language, 'assignments', code)
        const results: { [key: string]: VariableAssignment[] } = {}
        let varAssignment = new VariableAssignment()
        let varAssignmentIdentifier = ''
        captures.forEach(c => {
            let content = c.node.text
            const startLine = c.node.startPosition.row
            switch (c.name) {
                case 'assignment':
                    varAssignment = new VariableAssignment()
                    varAssignment.startLine = startLine
                    // varAssignment.endLine = c.node.parent?.endPosition.row || 99999
                    break
                case 'left':
                    varAssignmentIdentifier = content
                    varAssignment.left = varAssignmentIdentifier
                    if (Object.keys(results).includes(content) && c.name === 'left') {
                        results[content].slice(-1)[0].endLine = startLine - 1
                    }
                    break
                case 'right':
                    if (content.startsWith('(') && content.endsWith(')')) content = content.slice(1, -1)
                    // Remove parentheses and their contents
                    content = content.replace(/\(.*?\)/gs, '');
                    // Replace newlines and double spaces
                    
                    content = content.replace(/\n/g, '').replace(/  /g, '').trim();
                    // Check for any quotation marks, brackets, or braces
                    if (["\"", "'", "[", "]", "{", "}"].some(char => content.includes(char))) {
                        break
                    }
                    varAssignment.right = content
                    if (!Object.keys(results).includes(varAssignmentIdentifier)) results[varAssignmentIdentifier] = [] 
                    results[varAssignmentIdentifier].push(varAssignment)
                    break
            }
        })
        const resultsArray: VariableAssignment[] = []
        Object.keys(results).forEach(key  =>  resultsArray.push(...results[key]))
        // sort resultsArray by startLine in reverse
        resultsArray.sort((a, b) => b.startLine - a.startLine)
        return resultsArray
    }

    captureCalls(code: string, nodeRef: Node): CallIdentifier[]  {
        const captures  = captureQuery(this.fileNode.language, 'calls', code)
        captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row || a.node.startPosition.column - b.node.startPosition.column)
        const results: CallIdentifier[]  = []
        const nodesSeen: Set<string> = new Set()
        let childrenNames: string[] = []
        let possibleImportFrom = ''
        if (nodeRef.parent && nodeRef.parent.children) {
            childrenNames = Object.values(nodeRef.parent.children).map( c => c.name) // siblings
            // include methods as childrenNames
            Object.values(nodeRef.parent.children).forEach(c => {
                if (['class'].includes(c.type)) Object.values(c.children).forEach(c => childrenNames.push(c.name))
            })
            possibleImportFrom = nodeRef.parent.id
        } else if (nodeRef.type === 'file') {
            childrenNames = Object.values(nodeRef.children).map( c => c.name)
            // include methods as childrenNames
            Object.values(nodeRef.children).forEach(c => {
                if (['class'].includes(c.type)) Object.values(c.children).forEach(c => childrenNames.push(c.name))
            })
            possibleImportFrom = nodeRef.id
        }
        captures.forEach(c => {
            let content = c.node.text
            const startLine = c.node.startPosition.row
            const endLine =  c.node.endPosition.row
            // const nodeIdenfier = `${c.name}#L${startLine}.${c.node.startPosition.column}|${endLine}.${c.node.endPosition.column}`
            const nodeIdenfier = `${c.name}#L${startLine}.${c.node.startPosition.column}|${endLine}.${c.node.endPosition.column}`
            if (nodesSeen.has(nodeIdenfier)) return
            nodesSeen.add(nodeIdenfier)
            // console.log(c.name, content)
            if (["identifier.name", "parameter_type", "return_type"].includes(c.name)) {
                for ( const c of cleanAndSplitContent(content)) {
                    let importFrom = ''
                    const contentSplit = c.split('____')
                    if (contentSplit.length > 1) {
                        importFrom  = contentSplit.slice(0, -1).join('/')
                        importFrom = importFrom.replace(/__SPACE__/g, ' ').replace(/__DASH__/g, '-')
                    }
                    let callName = contentSplit.slice(-1)[0]
                    if (!importFrom && childrenNames.includes(callName)) importFrom = possibleImportFrom
                    if (importFrom) {
                        results.push(new CallIdentifier(callName, startLine, importFrom))
                        if (callName.includes('.')) {
                            const callNameSplit = callName.split('.')
                            for ( let i = 2; i < callNameSplit.length; i++) {
                                callName = callNameSplit.slice(0, i).join('.')
                                results.push(new CallIdentifier(callName, startLine, importFrom))
                            }
                        }
                    }
                }
            }
        })
        return results
    }

    getCallsFromNode(node: Node) : Call[] {
        let code  = Object.keys(node.children).length > 0 ? node.getCodeWithoutBody() : node.code
        const nameAliasReplacements: { [key: string]: string }  = {}
        this.fileNode.importStatements.forEach(i  =>  {
            const path = i.path.replace(/\//g, '____').replace(/ /g, '__SPACE__').replace(/-/g, '__DASH__')
            if (i.names.length === 0) nameAliasReplacements[i.moduleAlias] = path
            for (const importName of i.names) nameAliasReplacements[importName.alias] = `${path}____${importName.name}`
        })

        // Replace itself calls by the parent if its a method
        if (node.type === 'method') {
            const itself = itselfClassMap[node.language]
            const parentFileId = node.parent?.parent?.id.replace(/\//g, '____').replace(/ /g, '__SPACE__').replace(/-/g, '__DASH__') || ''
            const parentName = node.parent?.name || itself
            nameAliasReplacements[itself] = `${parentFileId}____${parentName}`
            // this solves a bug
            if (['javascript', 'typescript', 'tsx'].includes(node.language)) code = `function ${code}`
        }

        // 1. Replace import names with aliases
        Object.entries(nameAliasReplacements).forEach(([k, v]) => {
            const leftPattern = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
            code = code.replace(leftPattern, v);
        });

        // 2. Get Assignments
        const varReplacements = this.captureAssignments(code)
        const codeLines = code.split('\n')
        const lenCodeLines = codeLines.length

        // 3. Replace variable Assignments
        varReplacements.forEach(v  =>  {
            const startLine = v.startLine
            const endLine  = v.endLine
            const leftPattern = new RegExp(`(?<!\\.)\\b${v.left.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
            let i = 0
            try {
                for (i = startLine; i < Math.min(endLine + 1, lenCodeLines); i++) {
                    codeLines[i] = codeLines[i].replace(leftPattern, v.right)
                }
            } catch (error: any) {
                if (this.verbose) {
                    console.log(`Error in line ${i} (${v.left.slice(0,20)}, ${v.right.slice(0,20)})}): ${error.message}`)
                }
            }

        })
        code = codeLines.join('\n')
        const capturedCalls = this.captureCalls(code, node)
        const results: {[key: string]: Call} = {}
        const importStatementPaths = [this.fileNode.id, ...this.fileNode.importStatements.map(i => i.path)]
        // if (node.name.includes('method2')) console.log(capturedCalls)
        capturedCalls.forEach(c  =>  {
            let importFrom = c.importFrom
            let callName = c.name.replace(/\?/g, '')
            // This solve a bug with python, when one can import a module instead of a component
            let callNameSplit = callName.split('.')
            if (importFrom.endsWith('/'+callNameSplit[0])) {
                importFrom = importFrom.replace('/'+callNameSplit[0], '')
                callName = callNameSplit.slice(-1)[0]
            }
            // Exclude calls to the node itself if it is in the first lines since that is likely a mistake
            if (node.name == callName && c.line <= 1) return
            // Exclude if importFrom is not a path
            else if (!c.importFrom.includes('/')) return
            // Exclude if importFrom is not in the import statement paths
            else if (!importStatementPaths.includes(c.importFrom)) return
            if (!Object.keys(results).includes(`${c.importFrom}::${callName}`)) {
                results[`${c.importFrom}::${callName}`] = new Call(c.importFrom, callName)
            } 
            results[`${c.importFrom}::${callName}`].lines.push(c.line)
        })
        return Object.values(results)
    }
}