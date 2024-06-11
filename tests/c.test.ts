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

test("Function Definition", () => {
  const fileContent = `
/**
 * Calculates the sum of two integers.
 * @param a The first integer.
 * @param b The second integer.
 * @return The sum of a and b.
 */
int add(int a, int b) {
    return a + b;
}
`;
  const fileNode = new Node(`${rootFolderPath}/file.c`, fileContent, "file", "c");
  fileNode.getChildrenDefinitions();

  const expectedChildren = [
    {
      id: `${fileNode.id}::add`,
      type: "function",
      name: "add",
      label: "add",
      language: "c",
      exportable: false,
      documentation: `/**\n * Calculates the sum of two integers.\n * @param a The first integer.\n * @param b The second integer.\n * @return The sum of a and b.\n */`,
      code: "int add(int a, int b) {\n    return a + b;\n}",
      parent: fileNode.id,
      inDegree: 0,
      outDegree: 1,
      children: [],
    },
  ];

  const fileNodeChildrenSimplified = Object.values(fileNode.children).map((n) =>
    n.simplify(["id", "type", "name", "label", "language", "exportable", "documentation", "code", "parent", "inDegree", "outDegree", "children"])
  );

  expect(fileNodeChildrenSimplified).toStrictEqual(expectedChildren);
  expect(fileNode.inDegree).toBe(1);
});


test("Struct Definition", () => {
  const fileContent = `
/**
 * Represents a point in a 2D plane.
 */
struct Point {
    int x;
    int y;
}
`;
  const fileNode = new Node(`${rootFolderPath}/file.c`, fileContent, "file", "c");
  fileNode.getChildrenDefinitions();

  const expectedChildren = [
    {
      id: `${fileNode.id}::Point`,
      type: "struct",
      name: "Point",
      label: "Point",
      language: "c",
      exportable: false,
      documentation: `/**\n * Represents a point in a 2D plane.\n */`,
      code: "struct Point {\n    int x;\n    int y;\n}",
      parent: fileNode.id,
      inDegree: 0,
      outDegree: 1,
      children: []
    }
  ];

  const fileNodeChildrenSimplified = Object.values(fileNode.children).map((n) =>
    n.simplify(["id", "type", "name", "label", "language", "exportable", "documentation", "code", "parent", "inDegree", "outDegree", "children"])
  );

  expect(fileNodeChildrenSimplified).toStrictEqual(expectedChildren);
  expect(fileNode.inDegree).toBe(1);
});


test("Union Definition", () => {
  const fileContent = `
/**
 * Represents a value that can be either an integer or a floating-point number.
 */
union Value {
    int intValue;
    double floatValue;
};
`;
  const fileNode = new Node(`${rootFolderPath}/file.c`, fileContent, "file", "c");
  fileNode.getChildrenDefinitions();

  const expectedChildren = [
    {
      id: `${fileNode.id}::Value`,
      type: "union",
      name: "Value",
      label: "Value",
      language: "c",
      exportable: false,
      documentation: `/**\n * Represents a value that can be either an integer or a floating-point number.\n */`,
      code: "union Value {\n    int intValue;\n    double floatValue;\n}",
      parent: fileNode.id,
      inDegree: 0,
      outDegree: 1,
      children: []
    }
  ];

  const fileNodeChildrenSimplified = Object.values(fileNode.children).map((n) =>
    n.simplify(["id", "type", "name", "label", "language", "exportable", "documentation", "code", "parent", "inDegree", "outDegree", "children"])
  );

  expect(fileNodeChildrenSimplified).toStrictEqual(expectedChildren);
  expect(fileNode.inDegree).toBe(1);
});
