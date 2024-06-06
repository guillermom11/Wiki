import { Codebase, Node, ImportStatement, ImportName } from "../src/model/codebase";
const rootFolderPath = '/my/path'

const nodeAttributes = ['id', 'type', 'name', 'label', 'language', 'exportable', 'documentation', 'code', 'parent', 'inDegree', 'outDegree']

test('Import Statements', () => {
    const fileContent = `
import myModule.myFunction;
import myModule2.myClass2;
import myModule3.*;
import initFile.myFunction;
`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'java');
    fileNode.generateImports();
    fileNode.resolveImportStatementsPath(rootFolderPath, [`${rootFolderPath}/myModule.java`, `${rootFolderPath}/myModule2.java`, `${rootFolderPath}/myModule3.java`, `${rootFolderPath}/initFile.java`]);

    const expectedImports: ImportStatement[] = [
        new ImportStatement('myModule', [new ImportName('myFunction')], `${rootFolderPath}/myModule`),
        new ImportStatement('myModule2', [new ImportName('myClass2')], `${rootFolderPath}/myModule2`),
        new ImportStatement('myModule3', [], `${rootFolderPath}/myModule3`, 'myModule3'),
        new ImportStatement('initFile', [new ImportName('myFunction')], `${rootFolderPath}/initFile`),
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
    const classNodeChildren = Object.values(fileNode.children)[0].children;
    const fileNodeChildrenSimplified = Object.values(fileNode.children).map(n => n.simplify([...nodeAttributes, 'children']));
    const classNodeMethodsSimplified = Object.values(classNodeChildren).map(n => n.simplify(nodeAttributes));
    const expectedFileChildren = [
        {
            id: `${fileNode.id}::FooClass`,
            type: 'class',
            name: 'FooClass',
            label: 'FooClass',
            language: 'java',
            exportable: true,
            documentation: "/**\n * The FooClass documentation\n */",
            code: "public class FooClass {\n    private int foo = 1;\n\n    public FooClass() {\n        this.foo = 1;\n    }\n\n    public int bar() {\n        return 1;\n    }\n}",
            parent: fileNode.id,
            inDegree: 2,
            outDegree: 1,
            children: [`${fileNode.id}::FooClass.bar`, `${fileNode.id}::FooClass.FooClass`]
        },
    ];

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
    expect(fooClass.getCodeWithoutBody()).toBe("public class FooClass {\n    private int foo = 1;\n\n    public FooClass() {\n        this.foo = 1;\n    }\n\n    public int bar() \n        ...\n}");
    expect(barMethod.getCodeWithoutBody()).toBe("public class FooClass\n    ...\n    public int bar()\n        ...");
});

test('Calls', () => {
    const fileContent = `
class Foo {
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
}

public class Test {
	public static void main(String[] args){
		Foo fooVar = new Foo();
        fooVar.method();
	}
}

`;
    const fileNode = new Node(`${rootFolderPath}/file`, fileContent, 'file', 'java');
    fileNode.generateImports();
    const nodesMap = fileNode.getChildrenDefinitions();

    const fileNodesMap: { [id: string]: Node } = {};
    fileNodesMap[fileNode.id] = fileNode;
    nodesMap[fileNode.id] = fileNode;
    const codebase = new Codebase(rootFolderPath);
    codebase.nodesMap = nodesMap;
    codebase.getCalls(fileNodesMap);
    
    const mainCalls = codebase.getNode(`${rootFolderPath}/file::Test.main`)?.simplify(['calls']);
    const method2Calls = codebase.getNode(`${rootFolderPath}/file::Foo.method2`)?.simplify(['calls']);

    expect(mainCalls?.calls).toStrictEqual([`${rootFolderPath}/file::Foo`, `${rootFolderPath}/file::Foo.method`]);
    expect(method2Calls?.calls).toStrictEqual([`${rootFolderPath}/file::Foo.method`, `${rootFolderPath}/file::Foo`]);
});
