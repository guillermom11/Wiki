import {
    languageExtensionMap,
    excludedFolders,
    excludedExtensions,
    languages,
    AllowedTypesArray,
    AllowedTypes,
    treeSitterCommentTypes
} from "./consts"
import { treeSitterQueries, languageQueries } from "../queries"
import { glob } from 'glob'
import fs from 'node:fs/promises';
import Parser, { Query } from 'tree-sitter';
import { ImportStatement, ImportName, Node } from "./codebase";

export async function getAllFiles(rootFolderPath: string): Promise<string[]> {
    const extensionsPattern =  Object.keys(languageExtensionMap).map(ext => `\\.${ext}$`).join('|');
    const regex = new RegExp(extensionsPattern);
    const excludedPattern = excludedExtensions.map(ext  => `\\${ext}$`).join('|');
    const excludedRegex = new RegExp(excludedPattern)
    const files = await glob(`**/*`, {
        cwd: rootFolderPath,
        ignore: excludedFolders.map(f => `${f}/**`),
        absolute: true
    })
    // no sync
    const validFiles = await Promise.all(files.map(async (file) => (await fs.lstat(file)).isFile()))
    const matchingFiles  = files.filter((file, i)  => regex.test(file) && validFiles[i] && !excludedRegex.test(file))
    return matchingFiles;
}

export function getRequiredDefinitions(language: string): { parser: Parser, queries: treeSitterQueries} {
    const parser = new Parser()
    let queries
    switch (language) {
        case 'javascript':
            parser.setLanguage(languages.JavaScript)
            queries = languageQueries.Javascript
            break
        case 'python':
            parser.setLanguage(languages.Python)
            queries = languageQueries.Python
            break
        case 'typescript':
            parser.setLanguage(languages.TypeScript)
            queries = languageQueries.Typescript
            break
        case 'tsx':
            parser.setLanguage(languages.TSX)
            queries = languageQueries.Typescript
            break
        default:
            throw new Error(`Language ${language} not supported.`)
    }
    return { parser, queries }
}

export function captureQuery(language: string, queryName: keyof treeSitterQueries, code: string, queryArg?: string) : Parser.QueryCapture[] {
    const { parser, queries } = getRequiredDefinitions(language)
    const treeSitterQuery = (queryName === 'extraAssignmentCode' && queryArg) ? queries[queryName](queryArg) : queries[queryName] as string
    const query = new Parser.Query(parser.getLanguage(), treeSitterQuery)
    const tree = parser.parse(code)
    const captures = query.captures(tree.rootNode)
    return captures
}

export function generateImports(fileNode: Node) {
    if (fileNode.type !== 'file') return
    const captures = captureQuery(fileNode.language, 'importStatements', fileNode.code)
    // obtener captures unicos!
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

                newImportStatement.path = newImportStatement.module // FIX THIS
                newImportStatement.code = c.node.text
                newImportStatement.startPosition = c.node.startPosition
                newImportStatement.endPosition = c.node.endPosition
                importStatements.push(newImportStatement)
                newImportStatement = new ImportStatement()
                break;
        }
    })
    fileNode.importStatements = importStatements.reverse()
}

export async function GenerateNodesFromFile(filePath: string): Promise<{[id: string]: Node}> {
    
    const fileExtension  = filePath.split('.').pop()
    if (!fileExtension) return {}
    const data = await fs.readFile(filePath)
    const dataString = Buffer.from(data).toString()
    // Nodes are created using id, code, type, language
    const fileNode = new Node(filePath, dataString, 'file', languageExtensionMap[fileExtension])
    fileNode.name = filePath.split('/').pop()?.split('.').slice(-2)[0] || ''
    fileNode.alias = fileNode.name
    fileNode.documentation
    const unnecessaryNodeTypes = ['export'] // exclude it from the analysis
    const captures = captureQuery(fileNode.language, 'constructorDefinitions', fileNode.code)
    captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
    let exportable = ['python'].includes(fileNode.language) ? true : false
    const childrenNodes: Node[] = []

    captures.forEach((c)  => {
        if (AllowedTypesArray.includes(c.name as AllowedTypes)) {
            if (unnecessaryNodeTypes.includes(c.name)) return
            const newNode  = new Node(filePath, c.node.text, c.name as AllowedTypes, fileNode.language)

            newNode.startPosition  = c.node.startPosition
            newNode.endPosition  = c.node.endPosition
            newNode.exportable = exportable
            
            // In many languages the documentation is the prev sibling
            const prevTreeSitterNode = c.node.previousSibling
            if (prevTreeSitterNode) { 
                // if the previous node is a comment and it's in the previous line
                if (treeSitterCommentTypes.includes(prevTreeSitterNode.type) &&
                prevTreeSitterNode.startPosition.row === c.node.startPosition.row - 1) {
                    newNode.documentation  = prevTreeSitterNode.text
                }

            }
            childrenNodes.push(newNode)
        }
    })

    childrenNodes.forEach((n, i) => {
        // if (unnecessaryNodeTypes.includes(n.type)) return
        let code = n.code
        if (n.type === 'method' && ['javascript', 'typescript', 'tsx'].includes(fileNode.language)) {
            // Fix bug with methods
            code = `function ${n.code}`
            n.type = 'function'
        }
        let captures = captureQuery(fileNode.language, 'definitionTemplate', code)
        // console.log(`/////${n.type}, ${fileNode.language}/////`)
        // console.log(`${n.code}`)
        // console.log('--------------')
        captures = _cleanDefCaptures(captures, 'name')
        // console.log(captures.map(c => { return {name: c.name, text: c.node.text} }))
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
            const assignmentCaptures = captureQuery(fileNode.language, 'extraAssignmentCode', n.code, n.name)
            assignmentCaptures.forEach((c)  =>  {
                if (c.node.type === 'code') n.code += '\n\n' + c.node.text
            })
        }
    })

    childrenNodes.forEach((n, i) => {
        fileNode.addChild(n)
        n.parent = fileNode
        for (let j = i+1; j < childrenNodes.length; j++) {
            n.addNodeRelationship(childrenNodes[j])
            childrenNodes[j].addNodeRelationship(n)
        }
    })
    
    // childrenNodes.sort((a,b) => a.startPosition.row - b.startPosition.row || a.startPosition.column  - b.startPosition.column)
    
    const nodesMap = childrenNodes.reduce<{[id: string]: Node}>((map, n)  =>  {
        map[n.id]  = n
        return map
    }, {})
    nodesMap[fileNode.id] = fileNode
    parseExportClauses(fileNode, nodesMap)
    generateImports(fileNode)
    return nodesMap
}

function parseExportClauses(fileNode: Node, nodesMap: {[id: string]: Node}) {
    if (fileNode.type !== 'file') return
    if (['javascript', 'typescript', 'tsx'].includes(fileNode.language)) return
    const captures = captureQuery(fileNode.language, 'exportClauses', fileNode.code) 
    captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
    let name = ''
    let alias = ''
    captures.forEach(c => {
        switch (c.node.type) {
            case 'name':
                name = c.node.text ?? ''
                const node = nodesMap[`${fileNode.id}::${name}`]
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
        const node = nodesMap[`${fileNode.id}::${name}`]
        node.exportable  = true
        node.alias  = alias? alias  : name
    }
}

function _cleanDefCaptures(captures: Parser.QueryCapture[], keyword: string = 'name') : Parser.QueryCapture[] {
    captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row || a.node.startPosition.column - b.node.startPosition.column)

    let keywordCount = 0
    for (let i = 0; i < captures.length; i++) {
        if (captures[i].name === keyword) {
            keywordCount++
        }
        if (keywordCount > 1) {
            return captures.slice(0, i)
        }
    }
    return captures
}