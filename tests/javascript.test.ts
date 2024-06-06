import { Codebase, Node, ImportStatement, ImportName } from "../src/model/codebase"
const rootFolderPath = '/my/path'

const nodeAttributes = ['id', 'type', 'name', 'label', 'language', 'exportable', 'documentation', 'code', 'parent', 'inDegree', 'outDegree']

test('Import Statements', () => {
    const fileContent = `
import { myFunction } from './myModule';
import { myClass2 as myClass2Alias, myClass3 } from '../myModule2';
import * as myModule3Alias from 'myModule3';
import { myFunction as myFunctionAlias } from 'initFile';
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'javascript')
    fileNode.generateImports()
    fileNode.resolveImportStatementsPath(rootFolderPath, [`${rootFolderPath}/file.js`, `${rootFolderPath}/myModule3.js`, `${rootFolderPath}/initFile/index.js`])

    const expectedImports = [
        new ImportStatement('./myModule', [new ImportName('myFunction')], `/my/path/myModule`),
        new ImportStatement('../myModule2', [new ImportName('myClass3'), new ImportName('myClass2', 'myClass2Alias')], '/my/myModule2'),
        new ImportStatement('myModule3', [], '/my/path/myModule3', 'myModule3Alias'),
        new ImportStatement('initFile', [new ImportName('myFunction', 'myFunctionAlias')], '/my/path/initFile/index', 'initFile'),
    ];
    expect(fileNode.importStatements).toStrictEqual(expectedImports);
});

test('Assignments', () => {
    const fileContent = `
export const foo = 1

const bar = new Hono()
bar.get('/', async (c) => {
    return c.text('Hello, World!')
})

export { bar as cbar }
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'javascript')
    fileNode.getChildrenDefinitions()
    fileNode.parseExportClauses()
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify(nodeAttributes))
    const expectedFileChildren = [
        {
            id: `${fileNode.id}::foo`,
            type: 'assignment',
            name: 'foo',
            label: 'foo',
            language: 'javascript',
            exportable: true,
            documentation: '',
            code: 'foo = 1',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        },
        {
            id: `${fileNode.id}::cbar`,
            type: 'assignment',
            name: 'bar',
            label: 'cbar', // this is the name of the exported variable
            language: 'javascript',
            exportable: true,
            documentation: '',
            code: "bar = new Hono()\nbar.get('/', async (c) => {\n    return c.text('Hello, World!')\n})",
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        },
    ]
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren)
    expect(fileNode.inDegree).toBe(2)
});

test('Function definition', () => {
    const fileContent = `
/**
 * The foo documentation
 */
function foo() {
    return bar;
}

export function bar() {
    /**
     * The baz documentation
     */
    function baz() {
        return 1;
    }
    return baz();
}
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'javascript')
    fileNode.getChildrenDefinitions()
    const firstNodeChildren = Object.values(fileNode.children)[0].children[`${rootFolderPath}/file::baz`].simplify(['id', 'parent', 'code', 'documentation'])
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'children']))
    const expectedChildren = [
        {
            id: `${fileNode.id}::bar`,
            type: 'function',
            name: 'bar',
            label: 'bar',
            language: 'javascript',
            exportable: true,
            documentation: '',
            code: "function bar() {\n    /**\n     * The baz documentation\n     */\n    function baz() {\n        return 1;\n    }\n    return baz();\n}",
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
            language: 'javascript',
            exportable: false,
            documentation: `/**\n * The foo documentation\n */`,
            code: 'function foo() {\n    return bar;\n}',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1,
            children: []
        },
    ]
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedChildren);
    expect(fileNode.inDegree).toBe(2);
    expect(firstNodeChildren).toStrictEqual({
        id: `${rootFolderPath}/file::baz`,
        parent: `${fileNode.id}::bar`,
        code: 'function baz() {\n        return 1;\n    }',
        documentation: "/**\n     * The baz documentation\n     */"
    })
})

test('Class definition', () => {
    const fileContent = `
/**
 * The foo class
 */
class Foo {
    foo = 1;

    constructor() {
        this.foo = 1;
    }

    bar() {
        return 1;
    }
}

export { Foo as MyFoo }
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'javascript');
    fileNode.getChildrenDefinitions()
    fileNode.parseExportClauses()
    const classNodeChildren = Object.values(fileNode.children)[0].children;
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'children']));
    const classNodeMethodsSimplified = Object.values(classNodeChildren).map(n => n.simplify(nodeAttributes));
    const expectedFileChildren = [
        {
            id: `${fileNode.id}::MyFoo`,
            type: 'class',
            name: 'Foo',
            label: 'MyFoo',
            language: 'javascript',
            exportable: true,
            documentation: "/**\n * The foo class\n */",
            code: "class Foo {\n    foo = 1;\n\n    constructor() {\n        this.foo = 1;\n    }\n\n    bar() {\n        return 1;\n    }\n}",
            parent: fileNode.id,
            inDegree: 2,
            outDegree: 1,
            children: [`${fileNode.id}::MyFoo.bar`, `${fileNode.id}::MyFoo.constructor`]
        },
    ];

    const expectedMethods = [
        {
            id: `${fileNode.id}::MyFoo.bar`,
            type: 'method',
            name: 'Foo.bar',
            label: 'MyFoo.bar',
            language: 'javascript',
            exportable: false,
            documentation: '',
            code: "class Foo\n    ...\n    bar() {\n        return 1;\n    }",
            parent: `${fileNode.id}::MyFoo`,
            inDegree: 0,
            outDegree: 1
        },
        {
            id: `${fileNode.id}::MyFoo.constructor`,
            type: 'method',
            name: 'Foo.constructor',
            label: 'MyFoo.constructor',
            language: 'javascript',
            exportable: false,
            documentation: '',
            code: "class Foo\n    ...\n    constructor() {\n        this.foo = 1;\n    }",
            parent: `${fileNode.id}::MyFoo`,
            inDegree: 0,
            outDegree: 1
        },

    ];
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren);
    expect(fileNode.inDegree).toBe(1);
    expect(classNodeMethodsSimplified).toStrictEqual(expectedMethods);
});

test('Code without body', () => {
    const fileContent = `
/**
 * The foo class
 */
class Foo {

    foo = 1;

    constructor() {
        this.foo = 1;
    }

    bar() {
        return 1;
    }
}

function foo() {
    /**
     * The baz documentation
     */
    function baz() {
        return 1;
    }
    return baz();
}
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'javascript');
    fileNode.getChildrenDefinitions();

    const fooClass = fileNode.children[`${rootFolderPath}/file::Foo`];
    const barMethod = fooClass.children[`${rootFolderPath}/file::Foo.bar`];
    const fooFunction = fileNode.children[`${rootFolderPath}/file::foo`];

    expect(fooClass.getCodeWithoutBody()).toBe("class Foo {\n    foo = 1;\n\n    constructor() {\n        this.foo = 1;\n    }\n\n    bar() \n        ...\n}");
    expect(barMethod.getCodeWithoutBody()).toBe("class Foo\n    ...\n    bar()\n        ...");
    // functions with children remain unchanged?
    // expect(fooFunction.getCodeWithoutBody()).toBe("function foo() {\n    function baz() {\n    /**\n     * The baz documentation\n     */\n        return 1;\n    }\n    return baz();\n}");
})

test('Calls (TS)', () => {
    const fileContent = `
class Foo {
    constructor() {
        this.baz = 1;
    }

    method() {
        return 1;
    }

    method2() {
        return this.method();
    }
}

const fooVar = new Foo();
() => fooVar.method()

function foo(param: Foo) {
    return param.method2()
}
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'typescript');
    fileNode.generateImports();
    const nodesMap = fileNode.getChildrenDefinitions();

    const fileNodesMap: { [id: string]: Node } = {};
    fileNodesMap[fileNode.id] = fileNode;
    nodesMap[fileNode.id] = fileNode;
    const codebase = new Codebase(rootFolderPath);
    codebase.nodesMap = nodesMap;
    codebase.getCalls(fileNodesMap);
    const fileCalls = codebase.getNode(`${rootFolderPath}/file`)?.simplify(['calls']);
    const fooVarCalls = codebase.getNode(`${rootFolderPath}/file::fooVar`)?.simplify(['calls']);
    const method2Calls = codebase.getNode(`${rootFolderPath}/file::Foo.method2`)?.simplify(['calls']);
    const fooCalls = codebase.getNode(`${rootFolderPath}/file::foo`)?.simplify(['calls']);

    expect(fileCalls?.calls).toStrictEqual([`${rootFolderPath}/file::Foo`, `${rootFolderPath}/file::Foo.method`]);
    expect(fooVarCalls?.calls).toStrictEqual([`${rootFolderPath}/file::Foo`]);
    expect(method2Calls?.calls).toStrictEqual([`${rootFolderPath}/file::Foo.method`, `${rootFolderPath}/file::Foo`]);
    expect(fooCalls?.calls).toStrictEqual([`${rootFolderPath}/file::Foo`, `${rootFolderPath}/file::Foo.method2`])
});