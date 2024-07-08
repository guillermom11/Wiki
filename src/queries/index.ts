import { jsQueries } from "./javascript"
import { tsQueries } from "./typescript"
import { pyQueries } from "./python"
import { javaQueries } from "./java"
import { cQueries } from "./c"
import { phpQueries } from "./php"

export const languageQueries = {
    Javascript: jsQueries,
    Typescript: tsQueries,
    Python: pyQueries,
    Java: javaQueries,
    C: cQueries,
    PHP: phpQueries,
}


export interface treeSitterQueries {
    // found all import statements
    importStatements: string
    // found all definitions, such as classes, functions, etc
    constructorDefinitions: string
    // found name and body of each definition
    definitionTemplate: string
    // found export clauses, necessary for js, ts and tsx
    exportClauses: string
    // found all (global) assignments
    assignments: string
    // for instance, if the assignment is a class and the code uses a method globally, add it to the assignment code
    extraAssignmentCode: (name: string) => string
    // found all calls
    calls: string
    // found space declaration, such as using "package" in java, or "namespace" in PHP, C#, etc
    spaceDeclaration: string
}