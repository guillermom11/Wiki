import { AllowedTypes } from "./consts"


interface ImportName {
    name: string
    alias?: string
    subpath?: string
}

export interface ImportStatement {
    module: string
    names?: ImportName[]
    moduleAlias?: string
    code?: string
    path?: string
    startPoint?: [number, number]
    endPoint?: [number, number]

}

interface INode {
    id: string
    type: AllowedTypes
    name?: string
    alias?: string
    language?: string
    importStatements?: ImportStatement[] // only for files
    totalTokens?: number
    documentation?: string
    code?: string
    body?: string
    exportable?: boolean
    parent?: Node
    children?: Node[]
    startPoint?: [number, number]
    endPoint?: [number, number]
    inDegree?: number
    outDegree?: number
}

export interface ILink {
    source: Node
    target: Node
    label?: string
}