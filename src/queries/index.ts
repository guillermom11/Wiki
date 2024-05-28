import { jsQueries } from "./javascript"
import { tsQueries } from "./typescript"
import { pyQueries } from "./python"

export const languageQueries = {
    Javascript: jsQueries,
    Typescript: tsQueries,
    Python: pyQueries
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