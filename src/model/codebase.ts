import { AllowedTypes, languageExtensionMap, newClassMethodsMap } from "./consts"
import { Point } from 'tree-sitter'

export class ImportName {
    name: string = ''
    alias: string = ''
    subpath: string = ''

    constructor(name: string, alias?: string) {
        this.name = name
        this.alias  = alias || name
    }
}
export class ImportStatement {
    module: string = ''
    names: ImportName[] = []
    moduleAlias: string = ''
    code: string = ''
    path: string = ''
    startPosition: Point = {row: 0, column: 0}
    endPosition: Point = {row: 9999, column: 0}
}

export class Node {
    id: string = '' // id is like /home/user/repo/file.extension::nodeName
    type: AllowedTypes = 'function'
    name?: string
    alias?: string
    language?: string
    importStatements: ImportStatement[] = [] // only for files
    totalTokens: number = 0
    documentation: string = ''
    code: string = ''
    body: string = ''
    exportable: boolean = false
    parent?: Node
    children: Node[] = []
    startPosition: Point = {row: 0, column: 0}
    endPosition: Point = {row: 9999, column: 0}
    inDegree: number = 0
    outDegree: number = 0


    addChild(child: Node) {
        this.children.push(child)
    }

    addImportStatement(importStatement: ImportStatement) {
        this.importStatements.push(importStatement)
    }

    isWithin(node: Node): boolean {
       return this.startPosition <= node.startPosition && this.endPosition >= node.endPosition
    }

    addNodeRelationship(node: Node) {
        if (this.isWithin(node) && (!this.parent || this.parent.type === 'file')) {
            if (node.type === 'export') {
                this.exportable = true
                if (!this.documentation) this.documentation = node.documentation
                return
            }

            const parentCode = node.code.replace(node.body, '')
            this.code = parentCode + this.code
            node.addChild(this)
            // Case for py, js and ts
            if (['class', 'interface'].includes(node.type) && this.type === 'function') {
                this.type = 'method'
                this.name = `${node.name}.${this.name}`
                this.alias = this.name // methods has no alias
                return
            }
        }
    }

    propagateExportable() {
        if (this.exportable) {
            this.children.forEach(child => {
                child.exportable = true
                child.propagateExportable()
            })
        }
    }

    getCodeWithoutBody() {
        let code = this.code

        if (this.body) {
            if (this.children) {
                const extension = this.id.split('::')[0].split('.').pop() || '';
                const language = languageExtensionMap[extension]
                const classMethodInit = newClassMethodsMap[language]
                this.children.forEach(child  => {
                    if (classMethodInit && this.type === 'class') {
                        // do not remove init methods
                        if (child.name?.endsWith(classMethodInit)) return

                        if (child.body) {
                            let bodyToRemove = child.body
                            bodyToRemove = bodyToRemove.replace(child.documentation, '')
                            const spaces = ' '.repeat(child.startPosition.column)
                            code = code.replace(bodyToRemove, `\n${spaces}    ...`)
                        }
                    }

                })
            } else {
                code = code.replace(this.body, "...")
            }
        }
        return code.trim()
    }
}


export class Codebase {
    rootFolderPath: string = ''
    nodesMap: { [id: string]: Node } = {}

    addNode(node: Node) {
        this.nodesMap[node.id] = node;
    }

    getNode(id: string): Node | undefined {
        return this.nodesMap[id];
    }


}


