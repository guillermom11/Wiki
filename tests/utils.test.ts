import * as utils from '../src/model/utils'
import { GraphLink, GraphNode } from '../src/utils/db'
import * as wikiutils from '../src/wiki/utils'

// import Parser from 'tree-sitter'

// cleanAndSplitContent
describe('Common', () => {
    test('cleanAndSplitContent: Get each element', () => {
        const content = '[first, [second: third], (fourth)]'
        const result = utils.cleanAndSplitContent(content)
        expect(result).toStrictEqual(['first', 'second', 'third', 'fourth'])})
})

describe('Wiki', () => {
    const nodes: GraphNode[] = [
        { id: '1', fullName: 'Node1', type: 'function', language: 'typescript', code: '', codeNoBody: '', totalTokens: 0, inDegree: 2, outDegree: 1, label: 'Node1' },
        { id: '2', fullName: 'Node2', type: 'function', language: 'typescript', code: '', codeNoBody: '', totalTokens: 0, inDegree: 0, outDegree: 1, label: 'Node2' },
        { id: '3', fullName: 'Node3', type: 'function', language: 'typescript', code: '', codeNoBody: '', totalTokens: 0, inDegree: 1, outDegree: 0, label: 'Node3' },
        { id: '4', fullName: 'Node4', type: 'function', language: 'typescript', code: '', codeNoBody: '', totalTokens: 0, inDegree: 0, outDegree: 1, label: 'Node4' },
    ];
    

    test('BFS v1', () => {

        const links: GraphLink[] = [
            { id: 'l1', source: '2', target: '3', label: 'calls' },
            { id: 'l2', source: '1', target: '3', label: 'calls' },
            { id: 'l3', source: '4', target: '1', label: 'calls' },
        ];
        const {callGraph } = wikiutils.buildGraphs(nodes, links)

        const expectedResults = {
            0 : ['2', '4'],
            1: ['1'],
            2: ['3'],
        }
        expect(wikiutils.bfsLevels(nodes, callGraph)).toStrictEqual(expectedResults)
    })

    test('BFS all to one', () => {

        const links: GraphLink[] = [
            { id: 'l1', source: '2', target: '3', label: 'calls' },
            { id: 'l2', source: '1', target: '3', label: 'calls' },
            { id: 'l3', source: '4', target: '3', label: 'calls' },
        ];
        const {callGraph } = wikiutils.buildGraphs(nodes, links)

        const expectedResults = {
            0 : ['1', '2', '4'],
            1: ['3'],
        }
        expect(wikiutils.bfsLevels(nodes, callGraph)).toStrictEqual(expectedResults)
    })

    test('BFS v3', () => {

        const links: GraphLink[] = [
            { id: 'l1', source: '2', target: '3', label: 'calls' },
            { id: 'l2', source: '2', target: '1', label: 'calls' },
            { id: 'l3', source: '4', target: '2', label: 'calls' },
        ];
        const {callGraph } = wikiutils.buildGraphs(nodes, links)
        const expectedResults = {
            0 : ['4'],
            1 : ['2'],
            2 : ['3', '1']
        }
        expect(wikiutils.bfsLevels(nodes, callGraph)).toStrictEqual(expectedResults)
    })

    test('BFS itself', () => {

        const links: GraphLink[] = [
            { id: 'l1', source: '2', target: '2', label: 'calls' },
            { id: 'l2', source: '1', target: '1', label: 'calls' },
            { id: 'l2', source: '3', target: '3', label: 'calls' },
            { id: 'l3', source: '4', target: '4', label: 'calls' },
        ];
        const {callGraph } = wikiutils.buildGraphs(nodes, links)
        const expectedResults = {
            0 : ['1', '2', '3', '4'],
        }
        expect(wikiutils.bfsLevels(nodes, callGraph)).toStrictEqual(expectedResults)
    })

    test('BFS circular', () => {

        const links: GraphLink[] = [
            { id: 'l1', source: '1', target: '2', label: 'calls' },
            { id: 'l2', source: '2', target: '3', label: 'calls' },
            { id: 'l2', source: '3', target: '4', label: 'calls' },
            { id: 'l3', source: '4', target: '1', label: 'calls' },
        ];
        const {callGraph } = wikiutils.buildGraphs(nodes, links)
        const expectedResults = {
            1 : ['1', '2', '3'],
            2 : ['4'],
        }
        expect(wikiutils.bfsLevels(nodes, callGraph)).toStrictEqual(expectedResults)
    })
})

// // renameSource
// describe('JS/TS/TSX', () => {
//     test('renameSource: Test module in the same folder', () => {
//         const filePath = '/my/folder/file.ts'
//         const sourceModuleName = './myModule'
//         const language = 'typescript'
//         const result = utils.renameSource(filePath, sourceModuleName, language)
//         expect(result).toBe('/my/folder/myModule')
//     })

//     test('renameSource: Test module in a subfolder', () => {
//         const filePath = '/my/folder/file.ts'
//         const sourceModuleName = './subFolder/myModule'
//         const language = 'typescript'
//         const result = utils.renameSource(filePath, sourceModuleName, language)
//         expect(result).toBe('/my/folder/subFolder/myModule')
//     })

//     test('renameSource: Test module in a parent folder', () => {
//         const filePath = '/my/folder/file.ts'
//         const sourceModuleName = '../myModule'
//         const language = 'typescript'
//         const result = utils.renameSource(filePath, sourceModuleName, language)
//         expect(result).toBe('/my/myModule')
//     })

//     test('renameSource: Test module in a parent parent folder', () => {
//         const filePath = '/my/folder/file.ts'
//         const sourceModuleName = '../../myModule'
//         const language = 'typescript'
//         const result = utils.renameSource(filePath, sourceModuleName, language)
//         expect(result).toBe('/myModule')
//     })
// })

// describe('Python', () => {
//     test('renameSource: Test module in the same folder', () => {
//         const filePath = '/my/folder/file.py'
//         const sourceModuleName = '.myModule'
//         const language = 'python'
//         const result = utils.renameSource(filePath, sourceModuleName, language)
//         expect(result).toBe('/my/folder/myModule')
//     })


//     test('renameSource: Test module in a subfolder', () => {
//         const filePath = '/my/folder/file.py'
//         const sourceModuleName = '.subFolder.myModule'
//         const language = 'python'
//         const result = utils.renameSource(filePath, sourceModuleName, language)
//         expect(result).toBe('/my/folder/subFolder/myModule')
//     })


//     test('renameSource: Test module in a parent folder', () => {
//         const filePath = '/my/folder/file.py'
//         const sourceModuleName = '..myModule'
//         const language = 'python'
//         const result = utils.renameSource(filePath, sourceModuleName, language)
//         expect(result).toBe('/my/myModule')
//     })

//     test('renameSource: Test module in a parent parent folder', () => {
//         const filePath = '/my/folder/file.py'
//         const sourceModuleName = '...myModule'
//         const language = 'python'
//         const result = utils.renameSource(filePath, sourceModuleName, language)
//         expect(result).toBe('/myModule')
//     })
// })





// captureQuery:
// - importStatements
// - constructorDefinitions
// - definitionTemplate
// - exportClauses
// - extraAssignmentCode(name)
// - calls
// - assignments

// describe('captureQuery',  () => {
//     describe('importStatements', () => {
//         test('JS/TS/TSX',  () => {
//             const code = `import { function as aFunction } from 'myModule'\nimport * as moduleAlias from 'myModule'\nconst { function } = require('myModule')`
//             const captures = utils.captureQuery('javascript', 'importStatements', code)
//             const capturesShort = captures.map(c => { return {type: c.name, text: c.node.text} })
//             const expectedCaptures = [
//                 // first import: simple function with alias
//                 { type: 'import_statement', text: `import { function as aFunction } from 'myModule'` },
//                 { type: 'name', text: `function` },
//                 { type: 'alias', text: `aFunction` },
//                 { type: 'module', text: `myModule` },
//                 // second import
//                 { type: 'import_statement', text: `import * as moduleAlias from 'myModule'` },
//                 { type: 'alias', text: `moduleAlias` },
//                 { type: 'module', text: `myModule` },
//                 // third import
//                 { type: 'import_statement', text: `const { function } = require('myModule')` },
//                 { type: 'name', text: `function` },
//                 { type: 'function', text: `require`},
//                 { type: 'module', text: `myModule` }
//             ]
//             expect(capturesShort).toStrictEqual(expectedCaptures)
//         })

//         test('Python',  () => {
//             const code = `from myModule import function as aFunction\nfrom myModule import *`
//             const captures = utils.captureQuery('python', 'importStatements', code)
//             const capturesShort = captures.map(c => { return {type: c.name, text: c.node.text} })
//             const expectedCaptures = [
//                 // first import: simple function with alias
//                 { type: 'import_statement', text: `from myModule import function as aFunction` },
//                 { type: 'module', text: `myModule` }, // in Python module's name comes first
//                 { type: 'name', text: `function` },
//                 { type: 'alias', text: `aFunction` },
//                 // second import
//                 { type: 'import_statement', text: `from myModule import *` },
//                 { type: 'module', text: `myModule` }, // in Python module's name comes first
//                 { type: 'wildcard', text: `*` } 
//             ]
//             expect(capturesShort).toStrictEqual(expectedCaptures)
//         })
//     })

//     describe('constructorDefinitions', () => {
//         test('JS/TS/TSX: Class',  () => {
//             const code = `from myModule import function as aFunction\nfrom myModule import *`
//             const captures = utils.captureQuery('python', 'importStatements', code)
//             const capturesShort = captures.map(c => { return {type: c.name, text: c.node.text} })
//             const expectedCaptures = [
//                 // first import: simple function with alias
//                 { type: 'import_statement', text: `from myModule import function as aFunction` },
//                 { type: 'module', text: `myModule` }, // in Python module's name comes first
//                 { type: 'name', text: `function` },
//                 { type: 'alias', text: `aFunction` },
//                 // second import
//                 { type: 'import_statement', text: `from myModule import *` },
//                 { type: 'module', text: `myModule` }, // in Python module's name comes first
//                 { type: 'wildcard', text: `*` } 
//             ]
//             expect(capturesShort).toStrictEqual(expectedCaptures)
//         })
//     })
// })
