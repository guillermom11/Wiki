import { languageExtensionMap, excludedFolders, excludedExtensions} from "./consts"
import { treeSitterQueries, QUERIES } from "../queries"
import { glob } from 'glob'
import { statSync } from 'node:fs'



import { language as jsLanguage } from "tree-sitter-javascript";
import { language as pyLanguage } from "tree-sitter-python";
const tsLanguage = require('tree-sitter-typescript').typescript
const tsxLanguage = require('tree-sitter-typescript').tsx
const Parser = require('tree-sitter');

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

export function getRequiredDefinitions(codeLanguage: string): [typeof Parser, treeSitterQueries] {
    const parser = new Parser()
    let queries 
    switch (codeLanguage) {
        case 'js':
            parser.setLanguage(jsLanguage)
            queries = QUERIES.javascript
            return [parser, queries]
        case 'py':
            parser.setLanguage(pyLanguage)
            queries = QUERIES.python
            return [parser, queries]
        case 'ts':
            parser.setLanguage(tsLanguage)
            queries = QUERIES.typescript
            return [parser, queries]
        case 'tsx':
            parser.setLanguage(tsxLanguage)
            queries = QUERIES.typescript
            return [parser, queries]
        default:
            throw new Error(`Language ${codeLanguage} not supported.`)
    }
}