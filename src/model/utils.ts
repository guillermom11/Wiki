import {
    languageExtensionMap,
    excludedFolders,
    excludedExtensions,
    languages,
    AllowedTypes,
    AllowedTypesArray,
    treeSitterCommentTypes,
    indexSuffixesMap
} from "./consts"
import { treeSitterQueries, languageQueries } from "../queries"
import { glob } from 'glob'
import fs from 'node:fs/promises';
import path from 'path'
import Parser from 'tree-sitter';
import { Node } from './codebase'

/**
 * Get a list of all files in a given folder, including only files with the given extensions
 * from languageExtensionMap, and excluding from excludedExtensions
 * 
 * @param rootFolderPath - The root folder to search in
 * @returns - The list of files from the given folder
 */
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
    matchingFiles.sort() // sorted
    return matchingFiles;
}

/**
 * Returns the Tree-Sitter parser and queries for a given language
 * @param language - The language to use
 * @returns - The parser and queries for the given language
 */
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

/**
 * Use Tree-Sitter to capture a query from treeSitterQueries for a given language and code
 * 
 * @param language - The language to use
 * @param queryName - The name of the query to use, must be a key in treeSitterQueries
 * @param code - The code to parse
 * @param queryArg - The argument to pass to the query, only used for the extraAssignmentCode query
 * @returns 
 */
export function captureQuery(language: string, queryName: keyof treeSitterQueries, code: string, queryArg?: string) : Parser.QueryCapture[] {
    const { parser, queries } = getRequiredDefinitions(language)
    const treeSitterQuery = (queryName === 'extraAssignmentCode') ? queries[queryName](queryArg || '') : queries[queryName] as string
    const query = new Parser.Query(parser.getLanguage(), treeSitterQuery)
    const tree = parser.parse(code)
    const captures = query.captures(tree.rootNode)
    const uniqueMap = new Map();
    captures.forEach(c => {
        const key = `${c.name}|${c.node.text}|${c.node.startPosition.row}|${c.node.startPosition.column}`; // Create a unique key based on `name` and `text`
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, c);
        }
    });

    const uniqueCaptures = Array.from(uniqueMap.values());
    return uniqueCaptures
}

/**
 * Returns a cleaned list of captures up to the first occurence of the given keyword
 * @param captures - The captures to clean
 * @param keyword - The keyword to stop at
 */
export function cleanDefCaptures(captures: Parser.QueryCapture[], keyword1: string = 'name', keyword2: string = 'body') : Parser.QueryCapture[] {
    captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row || a.node.startPosition.column - b.node.startPosition.column)
    let keyword1Seen = false
    let skipKeyword2 = false
    
    const updatedCaptures = []
    for (let i = 0; i < captures.length; i++) {
        if (captures[i].name === keyword1) {
            if (!keyword1Seen) updatedCaptures.push(captures[i])
            else skipKeyword2 = true
            keyword1Seen = true
        } else if (captures[i].name === keyword2) {
            if (!skipKeyword2) {
                updatedCaptures.push(captures[i])
                return updatedCaptures
            }
            skipKeyword2 = false
            
        } else {
            updatedCaptures.push(captures[i])
        }

        
    }
    return updatedCaptures
}

/**
 * Rename the sourceName if it is a relative to filePath
 * @param filePath - The filePath to rename from
 * @param sourceName - The sourceName to rename to
 * @param language - The language to rename from
 * @returns The renamed sourceName
 */
export function renameSource(filePath: string, sourceName: string, language: string): string {
    let newSourceName = sourceName
    const sourceNameExtension = path.extname(sourceName)
    // remove extension if is in languageExtensionMap
    if (Object.keys(languageExtensionMap).includes(sourceNameExtension)) newSourceName = sourceName.split('.').slice(0, -1).join('.')
    const fileDirectory = filePath.split('/').slice(0, -1).join('/')

    if (['javascript', 'typescript', 'tsx', 'cpp'].includes(language) && newSourceName.includes('.') ) {
        newSourceName = path.normalize(path.join(fileDirectory, newSourceName))
    } else if ( language == 'python') {
        const dotCount = firstConsecutiveDots(newSourceName)
        newSourceName = newSourceName.replace(/\./g, '/')
        if (dotCount) {
            if (dotCount == 1) {
                newSourceName = path.normalize(path.join(fileDirectory, newSourceName))
            } else {
                const moveUpCount = dotCount - 1
                const newDirectory = fileDirectory.split('/').slice(0, -moveUpCount).join('/')
                newSourceName = path.normalize(path.join(newDirectory, newSourceName))
            }
        }
    }
    return newSourceName
}

function firstConsecutiveDots(s: string): number {
    const match = s.match(/^\.{1,}/);
    return match ? match[0].length : 0;
}

export const cleanAndSplitContent = (content: string): string[] => {
    // Remove parentheses and their contents, newlines, and unwanted characters
    // Replace ':' and '|' with ','
    content = content.replace(/\(|\)|\n|\s{2,}/gs, '')
                     .replace(/[:|]/g, ',')
                     .trim();
  
    // Split the content by commas, remove surrounding brackets/braces, and trim each part
    return content.split(',')
                  .map(item => item.replace(/[\[\]\{\}]/g, '').trim());
  }
  


export function getCalledNode(callName: string, importFrom: string, importedFileNodes: {[key: string]: Node}): Node | undefined {
    let importedFile = importedFileNodes[importFrom]
    let calledNode: Node | undefined  // empty,
    calledNode = importedFile?.getChild(`${importedFile.id}::${callName}`)
    return calledNode
}


export function getNodesDefinitionsFromFileNode(fileNode: Node): {[id: string]: Node}{
    const unnecessaryNodeTypes = ['export'] // exclude it from the analysis
    const captures = captureQuery(fileNode.language, 'constructorDefinitions', fileNode.code)
    captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
    let exportable = ['python'].includes(fileNode.language) ? true : false
    let childrenNodes: Node[] = []

    captures.forEach((c)  => {
        if (AllowedTypesArray.includes(c.name as AllowedTypes)) {
            const newNode  = new Node(fileNode.id, c.node.text, c.name as AllowedTypes, fileNode.language)

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

    childrenNodes.forEach(n => {
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

    // must have a name
    childrenNodes = childrenNodes.filter(c => c.name)

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
    return nodesMap
}

export function resolveImportStatementsPath(fileNode: Node, rootFolderPath: string, allFiles: string[]) {
    const suffix = indexSuffixesMap[fileNode.language];
    const fileSet = new Set(allFiles.map(p => p.split('.').slice(0, -1).join('.')));

    fileNode.importStatements.forEach((importStatement) => {
        const possiblePaths = [
            ...importStatement.names.map(name => path.resolve(`${importStatement.path}/${name.name}${suffix}`)),
            ...importStatement.names.map(name => path.resolve(`${importStatement.path}/${name.name}`)),
            `${importStatement.path}${suffix}`,
            importStatement.path
        ];

        for (const possiblePath of possiblePaths) {
            if (fileSet.has(possiblePath)) {
                importStatement.path = possiblePath.endsWith(suffix) ? possiblePath.split('/').slice(-1).join('/') : possiblePath
                break;
            }
        }

        if (importStatement.path.startsWith('@/')) {
            importStatement.path = path.join(rootFolderPath, importStatement.path.slice(2));
        }
    });
}