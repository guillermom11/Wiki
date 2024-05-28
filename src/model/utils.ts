import { languageExtensionMap, excludedFolders, excludedExtensions, languages} from "./consts"
import { treeSitterQueries, languageQueries } from "../queries"
import { glob } from 'glob'
import { statSync } from 'node:fs'
import Parser from 'tree-sitter';
import { ImportStatement, ImportName } from "./codebase";

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
    const matchingFiles  = files.filter(file  => regex.test(file) && statSync(file).isFile() && !excludedRegex.test(file))
    return matchingFiles;
}

export function getRequiredDefinitions(languageExtension: string): { parser: Parser, queries: treeSitterQueries} {
    const parser = new Parser()
    let queries
    switch (languageExtension) {
        case 'js':
            parser.setLanguage(languages.JavaScript)
            queries = languageQueries.Javascript
            break
        case 'py':
            parser.setLanguage(languages.Python)
            queries = languageQueries.Python
            break
        case 'ts':
            parser.setLanguage(languages.TypeScript)
            queries = languageQueries.Typescript
            break
        case 'tsx':
            parser.setLanguage(languages.TSX)
            queries = languageQueries.Typescript
            break
        default:
            throw new Error(`Language ${languageExtension} not supported.`)
    }
    return { parser, queries }
}

export function captureQuery(languageExtension: string, queryName: keyof treeSitterQueries, code: string) : Parser.QueryCapture[] {
    const { parser, queries } = getRequiredDefinitions(languageExtension)
    const query = new Parser.Query(parser.getLanguage(), queries[queryName])
    const tree = parser.parse(code)
    const captures = query.captures(tree.rootNode)
    return captures
}

export function generateImports(languageExtension: string, code: string) {
    const captures = captureQuery(languageExtension, 'importStatements', code)
    // obtener captures unicos!
    captures.sort((a, b) => b.node.startPosition.row - a.node.startPosition.row || b.node.startPosition.column - a.node.startPosition.column)
    // console.log({ captures: captures.map(c => {return {name : c.name, text : c.node.text}}) })
    const importStatements: ImportStatement[] = []
    let newImportStatement = new ImportStatement()
    let alias: string
    captures.forEach(capture => {
        switch (capture.name) {
            case 'alias':
                alias = capture.node.text
                break
            case 'module':
                newImportStatement.module = capture.node.text
                break
            case 'name':
                const name = capture.node.text
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

                newImportStatement.path = newImportStatement.module
                newImportStatement.code = capture.node.text
                newImportStatement.startPosition = capture.node.startPosition
                newImportStatement.endPosition = capture.node.endPosition
                importStatements.push(newImportStatement)
                newImportStatement = new ImportStatement()
                break;
        }
    })
    return importStatements.reverse()
}