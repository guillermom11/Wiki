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
