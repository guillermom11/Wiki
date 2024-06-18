import { Codebase, Node, ImportStatement, ImportName } from "../src/model/codebase"
const rootFolderPath = '/my/path'

const nodeAttributes = ['id', 'type', 'name', 'label', 'language', 'exportable', 'documentation', 'code', 'parent', 'inDegree', 'outDegree']

test('Import Statements', () => {
    const fileContent = `
    #include <stdio.h>
    #include "myHeader.h"
    #include "../otherFolder/otherHeader.h"
    `

    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'c')
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
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'c');
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
            parent: '/my/path/file',
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
            parent: '/my/path/file',
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
            parent: '/my/path/file',
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
  const fileNode = new Node(`${rootFolderPath}/file`, fileContent, "file", "c");
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
  const fileNode = new Node(`${rootFolderPath}/file`, fileContent, "file", "c");
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
  const fileNode = new Node(`${rootFolderPath}/file`, fileContent, "file", "c");
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


test('Header file', () => {
  const fileContent = `
typedef struct Point {
    int x;
    int y;
} Point;

typedef union Value {
    int intValue;
    double floatValue;
} Value;

void function();
`

  const node = new Node(`${rootFolderPath}/file.h`, fileContent, "header", "c");
  node.getChildrenDefinitions();
  const expectedChildren = [
    {
      id: `${node.id}::function`,
      type: "function",
      name: "function"
    },
    {
      id: `${node.id}::Value`,
      type: "union",
      name: "Value"
    },
    {
      id: `${node.id}::Point`,
      type: "struct",
      name: "Point"
    },
  ];

  const fileNodeChildrenSimplified = Object.values(node.children).map((n) =>
    n.simplify(["id", "type", "name"])
  );

  expect(fileNodeChildrenSimplified).toStrictEqual(expectedChildren);
  expect(node.inDegree).toBe(3);
})

test('Calls', () => {
  const fileContent1 = `
int add(int a, int b) {
  return a + b;
}
`;

  const fileContent2 = `
#include <stdio.h>
#include "file1.h"

int x = 10;
int y = 20;

int main() {
  int sum = add(x, y);
  int diff = subtract(x, y);
  printf("The sum of %d and %d is %d\\n", x, y, sum);
  printf("The difference of %d and %d is %d\\n", x, y, diff);
  return 0;
}
`;

  const fileNode1 = new Node(`${rootFolderPath}/file1`, fileContent1, 'file', 'c');
  const fileNode2 = new Node(`${rootFolderPath}/file2`, fileContent2, 'file', 'c');
  const allFiles = [`${rootFolderPath}/file1.c`, `${rootFolderPath}/file2.c`];

  fileNode1.generateImports()
  fileNode2.generateImports()
  fileNode1.resolveImportStatementsPath(rootFolderPath, allFiles)
  fileNode2.resolveImportStatementsPath(rootFolderPath, allFiles)
  
  const nodesMap1 = fileNode1.getChildrenDefinitions();
  const nodesMap2 = fileNode2.getChildrenDefinitions();

  const fileNodesMap: { [id: string]: Node } = {};
  fileNodesMap[fileNode1.id] = fileNode1;
  fileNodesMap[fileNode2.id] = fileNode2;

  const nodesMap = { ...nodesMap1, ...nodesMap2 };
  const codebase = new Codebase(rootFolderPath);
  codebase.nodesMap = nodesMap;
  codebase.getCalls(fileNodesMap);

  
  const mainCalls = codebase.getNode(`${rootFolderPath}/file2::main`)?.simplify(['calls']);
  const expectedMainCalls = [`${rootFolderPath}/file1::add`, `${rootFolderPath}/file2::x`, `${rootFolderPath}/file2::y`];
  expect(mainCalls?.calls).toStrictEqual(expectedMainCalls);
});
