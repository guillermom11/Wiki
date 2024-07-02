import { Codebase, Node, ImportStatement, ImportName } from "../src/model/codebase"
const rootFolderPath = '/my/path'

const nodeAttributes = ['id', 'type', 'name', 'label', 'language', 'exportable', 'documentation', 'code', 'parent', 'inDegree', 'outDegree']

test('Import Statements', () => {
    const fileContent = `
<?php
include 'file.php';
include_once 'file2.php';
require '../otherFolder/file3.php';
require_once 'file4.php';
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'php');
    fileNode.generateImports();
    fileNode.resolveImportStatementsPath(rootFolderPath,
        [`${rootFolderPath}/file.php`,
         `${rootFolderPath}/file2.php`,
         `/my/otherFolder/file3.php`,
         `${rootFolderPath}/file4.php`,])

    const expectedImports = [
        new ImportStatement('file.php', [], `${rootFolderPath}/file`),
        new ImportStatement('file2.php', [], `${rootFolderPath}/file2`),
        new ImportStatement('../otherFolder/file3.php', [], `/my/otherFolder/file3`),
        new ImportStatement('file4.php', [], `${rootFolderPath}/file4`),
    ];
    expect(fileNode.importStatements).toStrictEqual(expectedImports);
});

test('Global Variable Assignments', () => {
    const fileContent = `
<?php

$globalVar = 'Hello, World!';
$globalFoo = 'Foo';
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'php');
    fileNode.getChildrenDefinitions();

    const expectedFileChildren = [
        {
            id: `${fileNode.id}::globalFoo`,
            type: 'assignment',
            name: 'globalFoo',
            label: 'globalFoo',
            language: 'php',
            exportable: true,
            documentation: '',
            code: '$globalFoo = \'Foo\'',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        },
        {
            id: `${fileNode.id}::globalVar`,
            type: 'assignment',
            name: 'globalVar',
            label: 'globalVar',
            language: 'php',
            exportable: true,
            documentation: '',
            code: '$globalVar = \'Hello, World!\'',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        },
    ];

    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify(nodeAttributes));
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren);
    expect(fileNode.inDegree).toBe(2);
});

test('Function Definition', () => {
    const fileContent = `
<?php
/**
 * The foo function documentation
 */
function foo() {
    return "foo";
}

/**
 * The bar function documentation
 * @param int $x
 * @param int $y
 * @return int
 */
function bar($x, $y) {
    return $x + $y;
}
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'php');
    fileNode.getChildrenDefinitions();

    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'children']));
    const expectedChildren = [
        {
            id: `${fileNode.id}::bar`,
            type: 'function',
            name: 'bar',
            label: 'bar',
            language: 'php',
            exportable: true,
            documentation: '/**\n * The bar function documentation\n * @param int $x\n * @param int $y\n * @return int\n */',
            code: 'function bar($x, $y) {\n    return $x + $y;\n}',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1,
            children: []
        },
        {
            id: `${fileNode.id}::foo`,
            type: 'function',
            name: 'foo',
            label: 'foo',
            language: 'php',
            exportable: true,
            documentation: '/**\n * The foo function documentation\n */',
            code: 'function foo() {\n    return "foo";\n}',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1,
            children: []
        }
    ];

    expect(fileNodeChildrenSimplified).toStrictEqual(expectedChildren);
    expect(fileNode.inDegree).toBe(2);
});


test('Class Definition', () => {
    const fileContent = `
<?php
/**
 * The Foo class documentation
 */
class Foo {
    public $bar = 1;

    /**
     * The constructor documentation
     * @param int $x
     */
    public function __construct($x) {
        $this->bar = $x;
    }

    public function baz() {
        return $this->bar;
    }
}
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'php');
    fileNode.getChildrenDefinitions();

    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'children']));
    const classNodeChildren = Object.values(fileNode.children)[0].children;
    const classNodeMethodsSimplified = Object.values(classNodeChildren).map(n => n.simplify(nodeAttributes));

    const expectedFileChildren = [
        {
            id: `${fileNode.id}::Foo`,
            type: 'class',
            name: 'Foo',
            label: 'Foo',
            language: 'php',
            exportable: true,
            documentation: '/**\n * The Foo class documentation\n */',
            code: "class Foo {\n    public $bar = 1;\n\n    /**\n     * The constructor documentation\n     * @param int $x\n     */\n    public function __construct($x) {\n        $this->bar = $x;\n    }\n\n    public function baz() {\n        return $this->bar;\n    }\n}",
            parent: fileNode.id,
            inDegree: 2,
            outDegree: 1,
            children: [`${fileNode.id}::Foo.baz`, `${fileNode.id}::Foo.__construct`]
        }
    ];

    const expectedMethods = [
        {
            id: `${fileNode.id}::Foo.baz`,
            type: 'method',
            name: 'Foo.baz',
            label: 'Foo.baz',
            language: 'php',
            exportable: true,
            documentation: '',
            code: "class Foo\n    ...\n    public function baz() {\n        return $this->bar;\n    }",
            parent: `${fileNode.id}::Foo`,
            inDegree: 0,
            outDegree: 1
        },
        {
            id: `${fileNode.id}::Foo.__construct`,
            type: 'method',
            name: 'Foo.__construct',
            label: 'Foo.__construct',
            language: 'php',
            exportable: true,
            documentation: '/**\n     * The constructor documentation\n     * @param int $x\n     */',
            code: "class Foo\n    ...\n    public function __construct($x) {\n        $this->bar = $x;\n    }",
            parent: `${fileNode.id}::Foo`,
            inDegree: 0,
            outDegree: 1
        }
    ];

    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren);
    expect(fileNode.inDegree).toBe(1);
    expect(classNodeMethodsSimplified).toStrictEqual(expectedMethods);
});
