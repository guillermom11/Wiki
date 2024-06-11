import { Codebase, Node, ImportStatement, ImportName } from "../src/model/codebase"
const rootFolderPath = '/my/path'

const nodeAttributes = ['id', 'type', 'name', 'label', 'language', 'exportable', 'documentation', 'code', 'parent', 'inDegree', 'outDegree']

test('Import Statements', () => {
    const fileContent = `
    #include <stdio.h>
    #include "myHeader.h"
    #include "../otherFolder/otherHeader.h"
    `

    const fileNode = new Node(`${rootFolderPath}/file.c`, fileContent, 'file', 'c')
    fileNode.generateImports()

    const expectedImports = [
        new ImportStatement("<stdio.h>", [], "<stdio.h>"),
        new ImportStatement("myHeader.h", [], "/my/path/myHeader"),
        new ImportStatement("../otherFolder/otherHeader.h", [], "/my/otherFolder/otherHeader"),
      ];
      expect(fileNode.importStatements).toStrictEqual(expectedImports);
})

test('Assignments', () => {
    const fileContent = `
int x = 10;
float y = 3.14;
int* p = &x;

`;
    const fileNode = new Node(`${rootFolderPath}/file.c`, fileContent, 'file', 'c');
    fileNode.getChildrenDefinitions();

    const expectedFileChildren = [
        {
            id: `${fileNode.id}::p`,
            type: 'assignment',
            name: 'p',
            label: 'p',
            language: 'c',
            exportable: false,
            documentation: '',
            code: 'int* p = &x;',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        },
        {
            id: `${fileNode.id}::y`,
            type: 'assignment',
            name: 'y',
            label: 'y',
            language: 'c',
            exportable: false,
            documentation: '',
            code: 'float y = 3.14;',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        },
        {
            id: `${fileNode.id}::x`,
            type: 'assignment',
            name: 'x',
            label: 'x',
            language: 'c',
            exportable: false,
            documentation: '',
            code: 'int x = 10;',
            parent: fileNode.id,
            inDegree: 0,
            outDegree: 1
        }
    ];

    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify(nodeAttributes));
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren);
    expect(fileNode.inDegree).toBe(3);
});
