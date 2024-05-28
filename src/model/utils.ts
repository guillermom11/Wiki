import {
    languageExtensionMap,
    excludedFolders,
    excludedExtensions,
    languages,

} from "./consts"
import { treeSitterQueries, languageQueries } from "../queries"
import { glob } from 'glob'
import fs from 'node:fs/promises';
import path from 'path'
import Parser from 'tree-sitter';

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
    if (['assignments'].includes(queryName)) console.log({ language, treeSitterQuery, code})
    const query = new Parser.Query(parser.getLanguage(), treeSitterQuery)
    const tree = parser.parse(code)
    const captures = query.captures(tree.rootNode)
    return captures
}

/**
 * Returns a cleaned list of captures up to the first occurence of the given keyword
 * @param captures - The captures to clean
 * @param keyword - The keyword to stop at
 */
export function cleanDefCaptures(captures: Parser.QueryCapture[], keyword: string = 'name') : Parser.QueryCapture[] {
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
        if (dotCount) {
            if (dotCount == 1) {
                newSourceName = path.normalize(path.join(fileDirectory, newSourceName))
            } else {
                const moveUpCount = dotCount - 1
                const newDirectory = fileDirectory.split('/').slice(0, -moveUpCount).join('/')
                newSourceName = path.normalize(path.join(newDirectory, newSourceName))
            }
        }
        newSourceName.replace('.', '/')
    }
    return newSourceName
}

function firstConsecutiveDots(s: string): number {
    const match = s.match(/^\.{1,}/);
    return match ? match[0].length : 0;
}