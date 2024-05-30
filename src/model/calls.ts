import { cleanAndSplitContent, captureQuery } from "./utils"
import { ImportStatement } from "./codebase"
import { itselfClassMap } from "./consts"

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
    language: string = ''
    importStatements: ImportStatement[] = []
    verbose: boolean = true

    constructor(language: string, importStatements: ImportStatement[] = [], verbose: boolean = false) {
        this.language = language
        this.importStatements = importStatements
        this.verbose = verbose
    }

    captureAssignments(code: string): VariableAssignment[] {
        const captures = captureQuery(this.language, 'assignments', code)
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

    captureCalls(code: string): CallIdentifier[]  {
        const captures  = captureQuery(this.language, 'calls', code)
        captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row || a.node.startPosition.column - b.node.startPosition.column)
        const results: CallIdentifier[]  = []
        const nodesSeen: Set<string> = new Set()
        const forbiddenRegex = /['"\?\\\/()\[\]{}\$]/g
        captures.forEach(c => {
            let content = c.node.text
            const startLine = c.node.startPosition.row
            const endLine = c.node.endPosition.row
            const nodeIdenfier = `${c.name}#L${startLine}.${endLine}`
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
                    // heuristic
                    if (!forbiddenRegex.test(importFrom) && !forbiddenRegex.test(callName))
                        results.push(new CallIdentifier(callName, startLine, importFrom))

                    if (callName.includes('.')) {
                        const callNameSplit = callName.split('.')
                        const _importFrom = callNameSplit[0]
                        callName = callNameSplit.slice(1).join('.')
                        importFrom = importFrom? `${importFrom}/${_importFrom}` : _importFrom
                        // heuristic
                        if ((!forbiddenRegex.test(importFrom) && !forbiddenRegex.test(callName)))
                            results.push(new CallIdentifier(callName, startLine, importFrom))
                    }
                }
            }
        })
        return results
    }

    getCallsFromCode(code: string, nodeName?: string) : Call[] {
        
        const nameAliasReplacements: { [key: string]: string }  = {}
        this.importStatements.forEach(i  =>  {
            const path = i.path.replace(/\//g, '____').replace(/ /g, '__SPACE__').replace(/-/g, '__DASH__')
            for (const importName of i.names) nameAliasReplacements[importName.name] = `${path}____${importName.alias}`
            nameAliasReplacements[i.moduleAlias] = path
        })

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
        // console.log(code)
        const capturedCalls = this.captureCalls(code)
        // console.log(capturedCalls)
        const results: {[key: string]: Call} = {}
        const importStatementPaths = this.importStatements.map(i => i.path)
        capturedCalls.forEach(c  =>  {
            // Exclude calls to the node itself if it is in the first lines since that is likely a mistake
            if (nodeName == c.name && c.line <= 1) return
            // Exclude names with spaces
            else if (c.name.includes(' ')) return
            // Exclude if importFrom is not in the import statement paths
            else if (!c.importFrom.includes('/') && !importStatementPaths.includes(c.importFrom)) return
            if (!Object.keys(results).includes(`${c.importFrom}::${c.name}`)) {
                results[`${c.importFrom}::${c.name}`] = new Call(c.importFrom, c.name)
            } 
            results[`${c.importFrom}::${c.name}`].lines.push(c.line)
        })
        return Object.values(results)
    }
}