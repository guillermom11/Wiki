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

use MyProject\\Models\\User as UserModel;
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'php');
    fileNode.generateImports();
    fileNode.resolveImportStatementsPath(rootFolderPath,
        [`${rootFolderPath}/file.php`,
         `${rootFolderPath}/file2.php`,
         `/my/otherFolder/file3.php`,
         `${rootFolderPath}/file4.php`,])

    const expectedImports = [
        new ImportStatement('file.php', [], `${rootFolderPath}/file`, undefined,
            `include 'file.php';`),
        new ImportStatement('file2.php', [], `${rootFolderPath}/file2`, undefined,
            `include_once 'file2.php';`),
        new ImportStatement('../otherFolder/file3.php', [], `/my/otherFolder/file3`, undefined,
            `require '../otherFolder/file3.php';`),
        new ImportStatement('file4.php', [], `${rootFolderPath}/file4`, undefined,
            `require_once 'file4.php';`),
        new ImportStatement('MyProject\\Models', [new ImportName('User', 'UserModel')], 'MyProject\\Models', undefined,
            `use MyProject\\Models\\User as UserModel;`),
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


test('Namespace v1', () => {
    const fileContent = `
<?php
namespace MyProject\\Utilities;

use MyProject\\Models\\User;

class Helper {
    public static function greet(User $user) {
        return "Hello, " . $user->getName();
    }
}
`;
    const fileNode = new Node(`${rootFolderPath}/Helper.php`, fileContent, 'file', 'php');
    fileNode.getChildrenDefinitions();

    const namespaceChildren = Object.values(fileNode.children)[0];
    const namespaceChildrenSimplified = namespaceChildren.simplify(nodeAttributes)
    const classChildrenSimplified = Object.values(namespaceChildren.children)[0].simplify(nodeAttributes)

    const expectedNamespace = {
        id: `${fileNode.id}::MyProject\\Utilities`,
        type: 'namespace',
        name: 'MyProject\\Utilities',
        label: 'MyProject\\Utilities',
        language: 'php',
        exportable: true,
        documentation: '',
        code: `namespace MyProject\\Utilities;

use MyProject\\Models\\User;

class Helper {
    public static function greet(User $user) {
        return "Hello, " . $user->getName();
    }
}`,
        parent: fileNode.id,
        inDegree: 1,
        outDegree: 1,
    };


    const expectedClass = {
        id: `${fileNode.id}::Helper`,
        type: 'class',
        name: 'Helper',
        label: 'Helper',
        language: 'php',
        exportable: true,
        documentation: '',
        code: 'class Helper {\n    public static function greet(User $user) {\n        return "Hello, " . $user->getName();\n    }\n}',
        parent: `${fileNode.id}::MyProject\\Utilities`,
        inDegree: 1,
        outDegree: 1,
    };



    expect(namespaceChildrenSimplified).toStrictEqual(expectedNamespace);
    expect(classChildrenSimplified).toStrictEqual(expectedClass);
});



test('Namespace v2', () => {
    const fileContent = `
<?php
namespace MyProject\\Utilities {
    class Helper {
        public static function greet() {
            return "Hello, World";
        }
    }
}
`;
    const fileNode = new Node(`${rootFolderPath}/Helper.php`, fileContent, 'file', 'php');
    fileNode.getChildrenDefinitions();

    const namespaceChildren = Object.values(fileNode.children)[0];
    const namespaceChildrenSimplified = namespaceChildren.simplify(nodeAttributes)
    const classChildrenSimplified = Object.values(namespaceChildren.children)[0].simplify(nodeAttributes)

    const expectedNamespace = {
        id: `${fileNode.id}::MyProject\\Utilities`,
        type: 'namespace',
        name: 'MyProject\\Utilities',
        label: 'MyProject\\Utilities',
        language: 'php',
        exportable: true,
        documentation: '',
        code: `namespace MyProject\\Utilities {
    class Helper {
        public static function greet() {
            return "Hello, World";
        }
    }
}`,
        parent: fileNode.id,
        inDegree: 1,
        outDegree: 1,
    };


    const expectedClass = {
        id: `${fileNode.id}::Helper`,
        type: 'class',
        name: 'Helper',
        label: 'Helper',
        language: 'php',
        exportable: true,
        documentation: '',
        code: `class Helper {
        public static function greet() {
            return "Hello, World";
        }
    }`,
        parent: `${fileNode.id}::MyProject\\Utilities`,
        inDegree: 1,
        outDegree: 1,
    };



    expect(namespaceChildrenSimplified).toStrictEqual(expectedNamespace);
    expect(classChildrenSimplified).toStrictEqual(expectedClass);
});
