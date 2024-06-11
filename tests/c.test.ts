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