import { Codebase, Node, ImportStatement, ImportName } from "../src/model/codebase";
import path from "path"
const rootFolderPath = '/my/path'

const nodeAttributes = ['id', 'type', 'name', 'label', 'language', 'exportable', 'documentation', 'code', 'parent', 'inDegree', 'outDegree']

test('Import Statements',  () => {
    const fileContent = `
from .myModule import myFunction
from ..myModule2 import myClass2 as myClass2Alias, myClass3
import myModule3 as myModule3Alias
from initFile import myFunction
`
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'python')
    fileNode.generateImports()
    fileNode.resolveImportStatementsPath(rootFolderPath, [`${rootFolderPath}/file.py`, `${rootFolderPath}/myModule3.py`, `${rootFolderPath}/initFile/__init__.py`])

    const expectedImports: ImportStatement[] = [
        new ImportStatement('.myModule', [new ImportName('myFunction')], `/my/path/myModule`),
        new ImportStatement('..myModule2', [new ImportName('myClass3'), new ImportName('myClass2', 'myClass2Alias')], '/my/myModule2'),
        // myModule3 exists in the same folder
        new ImportStatement('myModule3', [], '/my/path/myModule3', 'myModule3Alias'),
        // initFile is a folder, but contains __init__.py
        new ImportStatement('initFile', [new ImportName('myFunction')], '/my/path/initFile/__init__', 'initFile'),
    ]
    expect(fileNode.importStatements).toStrictEqual(expectedImports)
})

test('Assignments',  () => {
    const fileContent = `
foo = 1
# the bar documentation
bar = baz
`
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'python')
    fileNode.getChildrenDefinitions()
    
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify(nodeAttributes))
    const expectedFileChildren = [
        {
            id: `${fileNode.id}::bar`,
            type: 'assignment',
            name: 'bar',
            label: 'bar',
            language: 'python',
            exportable: true,
            documentation: '# the bar documentation',
            code: 'bar = baz',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        },
        {
            id: `${fileNode.id}::foo`,
            type: 'assignment',
            name: 'foo',
            label: 'foo',
            language: 'python',
            exportable: true,
            documentation: '',
            code: 'foo = 1',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        },
    ]
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren)
    expect(fileNode.inDegree).toBe(2)
})


test('Function definition',  () => {
    const fileContent = `
def foo():
    '''The foo documentation'''
    return bar

def bar():
    def baz():
        '''The baz documentation'''
        return 1
    return baz()
`
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'python')
    fileNode.getChildrenDefinitions()
    const firstNodeChildren = Object.values(fileNode.children)[0].children[`${rootFolderPath}/file::baz`].simplify(['id', 'parent', 'code', 'documentation'])
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'codeNoBody', 'children']))
    const expectedChildren = [
        {
            id: `${fileNode.id}::bar`,
            type: 'function',
            name: 'bar',
            label: 'bar',
            language: 'python',
            exportable: true,
            documentation: '',
            code: "def bar():\n    def baz():\n        '''The baz documentation'''\n        return 1\n    return baz()",
            parent: fileNode.id,
            inDegree: 1,
            outDegree: 1,
            codeNoBody: "def bar():\n    def baz():\n        '''The baz documentation'''\n        return 1\n    return baz()", // functions with children remain unchanged?
            children: [`${fileNode.id}::baz`]
        },
        {
            id: `${fileNode.id}::foo`,
            type: 'function',
            name: 'foo',
            label: 'foo',
            language: 'python',
            exportable: true,
            documentation: `'''The foo documentation'''`,
            code: 'def foo():\n    \n    return bar',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1,
            codeNoBody: 'def foo():\n    ...',
            children: []
        },
    ]
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedChildren)
    expect(fileNode.inDegree).toBe(2)
    expect(firstNodeChildren).toStrictEqual({
        id: `${rootFolderPath}/file::baz`,
        parent: `${fileNode.id}::bar`,
        code: 'def baz():\n        \n        return 1',
        documentation: "'''The baz documentation'''"
    })
})

test('Class definition',  () => {
    const fileContent = `
class Foo:
    '''The foo class'''
    foo: int = 1

    def __init__(self):
        self.foo=1

    def bar(self):
        return 1
`
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'python')
    fileNode.getChildrenDefinitions()
    const classNodeChildren = Object.values(fileNode.children)[0].children
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'codeNoBody', 'children']))
    const classNodeMethodsSimplified = Object.values(classNodeChildren).map(n => n.simplify([...nodeAttributes, 'codeNoBody']))
    const expectedFileChildren = [
        {
            id: `${fileNode.id}::Foo`,
            type: 'class',
            name: 'Foo',
            label: 'Foo',
            language: 'python',
            exportable: true,
            documentation: "'''The foo class'''",
            code: "class Foo:\n    \n    foo: int = 1\n\n    def __init__(self):\n        self.foo=1\n\n    def bar(self):\n        return 1",
            parent: fileNode.id,
            inDegree: 2,
            outDegree: 1,
            codeNoBody: "class Foo:\n    \n    foo: int = 1\n\n    def __init__(self):\n        self.foo=1\n\n    def bar(self):\n        \n        ...", // functions with children remain unchanged?
            children: [`${fileNode.id}::Foo.bar`, `${fileNode.id}::Foo.__init__`]
        },
    ]

    const expectedMethods = [
        {
            id: `${fileNode.id}::Foo.bar`,
            type: 'method',
            name: 'Foo.bar',
            label: 'Foo.bar',
            language: 'python',
            exportable: true,
            documentation: '',
            code: "class Foo:\n    ...\n    def bar(self):\n        return 1",
            parent: `${fileNode.id}::Foo`,
            inDegree: 0,
            outDegree: 1,
            codeNoBody: "def bar(self):\n        ...",
        },
        {
            id: `${fileNode.id}::Foo.__init__`,
            type: 'method',
            name: 'Foo.__init__',
            label: 'Foo.__init__',
            language: 'python',
            exportable: true,
            documentation: '',
            code: "class Foo:\n    ...\n    def __init__(self):\n        self.foo=1",
            parent: `${fileNode.id}::Foo`,
            inDegree: 0,
            outDegree: 1,
            codeNoBody: "def __init__(self):\n        ...",
        },

    ]
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren)
    expect(fileNode.inDegree).toBe(1)
    expect(classNodeMethodsSimplified).toStrictEqual(expectedMethods)
    // expect(firstNodeChildren).toStrictEqual({
    //     id: `${rootFolderPath}/file::baz`,
    //     parent: `${fileNode.id}::bar`,
    //     code: 'def baz():\n        \n        return 1',
    //     documentation: "'''The baz documentation'''"
    // })
})
