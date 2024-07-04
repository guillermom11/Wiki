import { cleanAndSplitContent, captureQuery } from "./utils"
import { Node, ImportStatement} from "./codebase"
import { itselfClassMap } from "./consts"

class VariableAssignment {
    left: string = ''
    right: string = ''
    startLine: number = 0
    endLine: number = 99999
}

class CallIdentifier {
    nodeId: string
    line: number = 0

    constructor(nodeId: string, line: number) {
        this.nodeId = nodeId
        this.line = line
    }
}

export class CallsCapturer {
    fileNode: Node
    verbose: boolean = true
    nodesMap: {[key: string]: Node} = {}

    constructor(fileNode: Node, verbose: boolean = false) {
        this.fileNode = fileNode
        this.verbose = verbose
        fileNode.getAllChildren().forEach( c => this.nodesMap[c.alias] = c )
        fileNode.importStatements.forEach( i => {
            i.names.forEach(n => {
                if (n.node) {
                    this.nodesMap[n.alias] = n.node
                }
            })
        })
        // console.log(`/////${fileNode.id}`)
        // Object.keys(this.nodesMap).forEach(k => console.log(k))
    }

    captureAssignments(code: string, language: string): VariableAssignment[] {
        const captures = captureQuery(language, 'assignments', code)
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
        const captures  = captureQuery(nodeRef.language, 'calls', code)
        captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row || a.node.startPosition.column - b.node.startPosition.column)
        const results: CallIdentifier[]  = []
        const nodesSeen: Set<string> = new Set()

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
                    let callName = c.replace(/\?/g, '')
                    const calledNode = this.nodesMap[callName]
                    if (calledNode) {
                        results.push(new CallIdentifier(calledNode.id, startLine))
                    }
                    if (callName.includes('.')) {
                        const callNameSplit = callName.split('.')
                        for ( let i = 2; i < callNameSplit.length; i++) {
                            const calledNode =  this.nodesMap[callNameSplit.slice(0, i).join('.')]
                            if (calledNode) {
                                results.push(new CallIdentifier(calledNode.id, startLine))
                            }
                            
                        }
                    }
                    
                }
            }
        })
        return results
    }

    getCallsFromNode(fileId: string, node: Node) : {[key: string]: number[]} {
        // console.log(`///${node.name}///`)
        let code  = Object.keys(node.children).length > 0 ? node.getCodeWithoutBody() : node.code
        const nameAliasReplacements: { [key: string]: string }  = {}
        Object.values(this.fileNode.importStatements).forEach(i  =>  {
            if (i.names.length === 0) nameAliasReplacements[i.moduleAlias] = i.module
            for (const importName of i.names) nameAliasReplacements[importName.alias] = `${importName.name}`
        })
        // Replace itself calls by the parent if its a method
        if (node.type === 'method') {
            const itself = itselfClassMap[node.language]
            const parentName = node.parent?.name || itself
            nameAliasReplacements[itself] = parentName
            // this solves a bug
            if (['javascript', 'typescript', 'tsx'].includes(node.language)) code = `function ${code}`
        }

        // 1. Replace import names with aliases
        Object.entries(nameAliasReplacements).forEach(([k, v]) => {
            const leftPattern = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
            code = code.replace(leftPattern, v);
        });

        // 2. Get Assignments
        const varReplacements = this.captureAssignments(code, node.language)
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
        const results: {[key: string]: number[]} = {}
        capturedCalls.forEach(c  =>  {

            if (!Object.keys(results).includes(c.nodeId)) {
                results[c.nodeId] = []
            } 
            results[c.nodeId].push(c.line)
        })
        return results
    }
}