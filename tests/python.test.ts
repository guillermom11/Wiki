import { Codebase, Node, ImportStatement, ImportName } from "../src/model/codebase";
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
        new ImportStatement('.myModule', [new ImportName('myFunction')], `/my/path/myModule`,
        undefined, `from .myModule import myFunction`),
        new ImportStatement('..myModule2', [new ImportName('myClass3'), new ImportName('myClass2', 'myClass2Alias')], '/my/myModule2',
        undefined, `from ..myModule2 import myClass2 as myClass2Alias, myClass3`),
        // myModule3 exists in the same folder
        new ImportStatement('myModule3', [], '/my/path/myModule3', 'myModule3Alias',
            `import myModule3 as myModule3Alias`),
        // initFile is a folder, but contains __init__.py
        new ImportStatement('initFile', [new ImportName('myFunction')], '/my/path/initFile/__init__', 'initFile',
            `from initFile import myFunction`),
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
            inDegree: 1,
            outDegree: 0
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
            inDegree: 1,
            outDegree: 0
        },
    ]
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren)
    expect(fileNode.outDegree).toBe(2)
})


test('Function definition',  () => {
    const fileContent = `
@decorator
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
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'children']))
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
            code: '@decorator\ndef foo():\n    \n    return bar',
            parent: fileNode.id,
            inDegree: 1,
            outDegree: 0,
            children: []
        },
    ]
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedChildren)
    expect(fileNode.outDegree).toBe(2)
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
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'children']))
    const classNodeMethodsSimplified = Object.values(classNodeChildren).map(n => n.simplify(nodeAttributes))
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
            inDegree: 1,
            outDegree: 2,
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
            code: "class Foo:\n    \n    foo: int = 1\n\n    def __init__(self):\n        self.foo=1\n\n    def bar(self):\n        return 1",
            parent: `${fileNode.id}::Foo`,
            inDegree: 1,
            outDegree: 0
        },
        {
            id: `${fileNode.id}::Foo.__init__`,
            type: 'method',
            name: 'Foo.__init__',
            label: 'Foo.__init__',
            language: 'python',
            exportable: true,
            documentation: '',
            code: "class Foo:\n    \n    foo: int = 1\n\n    def __init__(self):\n        self.foo=1\n",
            parent: `${fileNode.id}::Foo`,
            inDegree: 1,
            outDegree: 0
        },

    ]
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren)
    expect(fileNode.outDegree).toBe(1)
    expect(classNodeMethodsSimplified).toStrictEqual(expectedMethods)
})



test('Code without body',  () => {
    const fileContent = `
    class Foo:
    '''The foo class'''
    foo: int = 1

    def __init__(self):
        self.foo=1

    def bar(self):
        return 1
        
def foo():
    def baz():
        '''The baz documentation'''
        return 1
    return baz()
`
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'python')
    fileNode.getChildrenDefinitions()

    const fooClass = fileNode.children[`${rootFolderPath}/file::Foo`]
    const barMethod = fooClass.children[`${rootFolderPath}/file::Foo.bar`]
    const fooFunction = fileNode.children[`${rootFolderPath}/file::foo`]

    expect(fooClass.getCodeWithoutBody()).toBe("class Foo:\n    foo: int = 1\n\n    def __init__(self):\n        self.foo=1\n\n    def bar(self):\n        \n        ...")
    expect(barMethod.getCodeWithoutBody()).toBe("class Foo:\n    ...\n    def bar(self):\n            ...")
    // functions with children remain unchanged?
    expect(fooFunction.getCodeWithoutBody()).toBe("def foo():\n    def baz():\n        '''The baz documentation'''\n        return 1\n    return baz()")
})


test('Calls',  () => {
    const fileContent1 = `
class Foo:
    def __init__(self):
        self.baz = 1
    
    def method(self):
        pass

    def method2(self):
        self.method()
    `
    const fileContent2 = `
from .file1 import Foo

foo_var = Foo()
if True:
    foo_var.method()

def foo(param: Foo):
    return param.method2()
`
    const fileNode1 = new Node(`${rootFolderPath}/file1`, fileContent1, 'file', 'python')
    const fileNode2 = new Node(`${rootFolderPath}/file2`, fileContent2, 'file', 'python')
    fileNode1.generateImports()
    fileNode2.generateImports()
    const nodesMap1 = fileNode1.getChildrenDefinitions()
    const nodesMap2 = fileNode2.getChildrenDefinitions()
    
    const fileNodesMap: {[id: string]: Node} = {}
    fileNodesMap[fileNode1.id] = fileNode1
    fileNodesMap[fileNode2.id] = fileNode2

    nodesMap1[fileNode1.id] = fileNode1
    nodesMap2[fileNode2.id] = fileNode2

    const nodesMap = {...nodesMap1, ...nodesMap2}
    const codebase = new Codebase(rootFolderPath)
    codebase.nodesMap = nodesMap

    codebase.resolveImportStatementsNodes()
    codebase.getCalls(fileNodesMap)
    
    const method2Calls = codebase.getNode(`${rootFolderPath}/file1::Foo.method2`)?.simplify(['calls'])
    const file2Calls = codebase.getNode(`${rootFolderPath}/file2`)?.simplify(['calls'])
    const fooVarCalls = codebase.getNode(`${rootFolderPath}/file2::foo_var`)?.simplify(['calls']) 
    const fooCalls = codebase.getNode(`${rootFolderPath}/file2::foo`)?.simplify(['calls'])
    
    expect(file2Calls?.calls).toStrictEqual([`${rootFolderPath}/file1::Foo`, `${rootFolderPath}/file1::Foo.method`])
    expect(fooVarCalls?.calls).toStrictEqual([`${rootFolderPath}/file1::Foo`])
    expect(method2Calls?.calls).toStrictEqual([`${rootFolderPath}/file1::Foo.method`, `${rootFolderPath}/file1::Foo`])
    expect(fooCalls?.calls).toStrictEqual([`${rootFolderPath}/file1::Foo`, `${rootFolderPath}/file1::Foo.method2`])
})
