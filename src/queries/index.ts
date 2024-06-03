import { jsQueries } from "./javascript"
import { tsQueries } from "./typescript"
import { pyQueries } from "./python"
import { javaQueries } from "./java"

export const languageQueries = {
    Javascript: jsQueries,
    Typescript: tsQueries,
    Python: pyQueries,
    Java: javaQueries
}


export interface treeSitterQueries {
    importStatements: string
    constructorDefinitions: string
    definitionTemplate: string
    exportClauses: string
    extraAssignmentCode: (name: string) => string
    calls: string
    assignments: string
}