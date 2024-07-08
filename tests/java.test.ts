import { Codebase, Node, ImportStatement, ImportName } from "../src/model/codebase";
const rootFolderPath = '/my/path'

const nodeAttributes = ['id', 'type', 'name', 'label', 'language', 'exportable', 'documentation', 'code', 'parent', 'inDegree', 'outDegree']

test('Import Statements', () => {
    const fileContent = `
import myModule.myClass1;
import myModule2.myClass2;
import myModule3.*;
import initFile.myClass;
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'java');
    fileNode.generateImports();
    fileNode.resolveImportStatementsPath(rootFolderPath, [`${rootFolderPath}/myModule.java`, `${rootFolderPath}/myModule2.java`, `${rootFolderPath}/myModule3.java`, `${rootFolderPath}/initFile.java`]);

    const expectedImports: ImportStatement[] = [
        new ImportStatement('myModule', [new ImportName('myClass1')], `${rootFolderPath}/myModule`, undefined,
                `import myModule.myClass1;`),
        new ImportStatement('myModule2', [new ImportName('myClass2')], `${rootFolderPath}/myModule2`, undefined,
                `import myModule2.myClass2;`),
        new ImportStatement('myModule3', [], `${rootFolderPath}/myModule3`, 'myModule3',
            `import myModule3.*;`),
        new ImportStatement('initFile', [new ImportName('myClass')], `${rootFolderPath}/initFile`, undefined,
    		`import initFile.myClass;`),
    ];
    expect(fileNode.importStatements).toStrictEqual(expectedImports);
});

// En java no se manejan los assignments "globales" como tal, si no que se utilizan
// variables estáticas dentro de una clase
// test('Assignments', () => {})

// En java no existen funciones como tal
// test('Function definition', () => {})

// En java el constructor se llama igual que la clase
test('Class definition', () => {
    const fileContent = `
package file;

/**
 * The FooClass documentation
 */
public class FooClass {
    private int foo = 1;

    public FooClass() {
        this.foo = 1;
    }

    public int bar() {
        return 1;
    }
}
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'java');
    fileNode.getChildrenDefinitions()
    const packageChildren = Object.values(fileNode.children)[0];
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'children']));
    const classNodeChildren: Node = Object.values(packageChildren.children)[0];
    const classChildrenSimplified = classNodeChildren.simplify([...nodeAttributes, 'children'])
    const classNodeMethodsSimplified = Object.values(classNodeChildren.children).map(n => n.simplify(nodeAttributes));
    
    const expectedFileChildren = [
        {
            id: `${fileNode.id}::file`,
            type: 'package',
            name: 'file',
            label: 'file',
            language: 'java',
            exportable: true,
            documentation: "",
            code: `package file;

/**
 * The FooClass documentation
 */
public class FooClass {
    private int foo = 1;

    public FooClass() {
        this.foo = 1;
    }

    public int bar() {
        return 1;
    }
}`,
            parent: fileNode.id,
            inDegree: 1,
            outDegree: 1,
            children: [`${fileNode.id}::FooClass`],
        },
    ];

    const expectedClass = 
        {
            id: `${fileNode.id}::FooClass`,
            type: 'class',
            name: 'FooClass',
            label: 'FooClass',
            language: 'java',
            exportable: true,
            documentation: "/**\n * The FooClass documentation\n */",
            code: "public class FooClass {\n    private int foo = 1;\n\n    public FooClass() {\n        this.foo = 1;\n    }\n\n    public int bar() {\n        return 1;\n    }\n}",
            parent: `${fileNode.id}::file`,
            inDegree: 2,
            outDegree: 1,
            children: [`${fileNode.id}::FooClass.bar`, `${fileNode.id}::FooClass.FooClass`],
        };

    const expectedMethods = [
        {
            id: `${fileNode.id}::FooClass.bar`,
            type: 'method',
            name: 'FooClass.bar',
            label: 'FooClass.bar',
            language: 'java',
            exportable: true,
            documentation: '',
            code: "public class FooClass\n    ...\n    public int bar() {\n        return 1;\n    }",
            parent: `${fileNode.id}::FooClass`,
            inDegree: 0,
            outDegree: 1
        },
        {
            id: `${fileNode.id}::FooClass.FooClass`,
            type: 'method',
            name: 'FooClass.FooClass',
            label: 'FooClass.FooClass',
            language: 'java',
            exportable: true,
            documentation: '',
            code: "public class FooClass\n    ...\n    public FooClass() {\n        this.foo = 1;\n    }",
            parent: `${fileNode.id}::FooClass`,
            inDegree: 0,
            outDegree: 1
        },

    ];
    expect(fileNodeChildrenSimplified).toStrictEqual(expectedFileChildren);
    expect(fileNode.inDegree).toBe(1);
    expect(classChildrenSimplified).toStrictEqual(expectedClass);
    expect(classNodeMethodsSimplified).toStrictEqual(expectedMethods);
});

test('Code without body', () => {
    const fileContent = `
/**
 * The FooClass documentation
 */
public class FooClass {

    private int foo = 1;

    public FooClass() {
        this.foo = 1;
    }

    public int bar() {
        return 1;
    }
}
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'java');
    
    fileNode.getChildrenDefinitions();

    const fooClass = fileNode.children[`${rootFolderPath}/file::FooClass`];
    const barMethod = fooClass.children[`${rootFolderPath}/file::FooClass.bar`];
    expect(fooClass.getCodeWithoutBody()).toBe("public class FooClass {\n    private int foo = 1;\n\n    public FooClass() {\n        this.foo = 1;\n    }\n\n    public int bar() {\n        //...\n    }\n}");
    expect(barMethod.getCodeWithoutBody()).toBe("public class FooClass\n    ...\n    public int bar() {\n    //...\n    }");
});

test('Calls', () => {
    const fileContent1 = `
package file1;

public class Foo {
    private int baz = 1;

    public Foo() {
        this.baz = 1;
    }

    public int method() {
        return 1;
    }

    public int method2() {
        return this.method();
    }
}`;

    const fileContent2 = `
import file1.Foo;

public class Test {
    public static void main(String[] args){
        Foo fooVar = new Foo();
        fooVar.method();
    }
}`;

    const fileNode1 = new Node(`${rootFolderPath}/file1`, fileContent1, 'file', 'java');
    const fileNode2 = new Node(`${rootFolderPath}/file2`, fileContent2, 'file', 'java');
    const allFiles = [`${rootFolderPath}/file1.java`, `${rootFolderPath}/file2.java`];

    fileNode1.generateImports()
    fileNode2.generateImports()

    fileNode1.name = `${rootFolderPath}/file1.java`
    fileNode2.name = `${rootFolderPath}/file2.java`

    const nodesMap1 = fileNode1.getChildrenDefinitions();
    const nodesMap2 = fileNode2.getChildrenDefinitions();

    const fileNodesMap: { [id: string]: Node } = {};
    fileNodesMap[fileNode1.id] = fileNode1;
    fileNodesMap[fileNode2.id] = fileNode2;

    nodesMap1[fileNode1.id] = fileNode1
    nodesMap2[fileNode2.id] = fileNode2
    
    const nodesMap = { ...nodesMap1, ...nodesMap2 };
    const codebase = new Codebase(rootFolderPath);
    codebase.nodesMap = nodesMap;

    Object.values(nodesMap).forEach(n => {
        // save space nodes
        if (['namespace', 'package', 'mod'].includes(n.type)) codebase.addNodeToSpaceMap(n)
    })

    codebase.resolveSpaces()
    codebase.resolveImportStatementsNodes();
    codebase.getCalls(fileNodesMap);

    const method2Calls = codebase.getNode(`file1::Foo.method2`)?.simplify(['calls']);
    const mainCalls = codebase.getNode(`${rootFolderPath}/file2::Test.main`)?.simplify(['calls']);

    expect(method2Calls?.calls).toStrictEqual([`file1::Foo.method`, `file1::Foo`]);
    expect(mainCalls?.calls).toStrictEqual([`file1::Foo`, `file1::Foo.method`]);
});
