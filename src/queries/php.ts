// Tree-sitter definition + call queries for PHP

// It considers:
// - Import statements
// - Global Assignments
// - Function definitions
// - Class definitions
// - Export clauses

// - Class, Method and Function calls
// - member expressions like this.my_method and Class.my_method
// - Arguments

import { treeSitterQueries } from './index';

///////////////////////
// IMPORT_STATEMENTS //
///////////////////////
// If there is no import.name  then no component is really imported
// import.module considers only the string fragment
const importStatements = `
(include_expression (string (string_content) @module )) @import_statement
(include_once_expression (string (string_content) @module )) @import_statement
(require_expression (string (string_content) @module )) @import_statement
(require_once_expression (string (string_content) @module )) @import_statement
`

/////////////////
// ASSIGNMENTS //
/////////////////
// Arrow functions are like assignments but contains a body in value
// Therefore, to remove them from assignments check if body exists in @right

// Global only
const assignments = `
`

//////////////////////////
// DEFINITIONS TEMPLATE //
//////////////////////////

const definitionTemplate = `
`

// The only way to detect if is async is to check if the function definition contains "async"
const constructorDefinitions = `
(class_declaration) @class
`

////////////////////
// EXPORTS_CLAUSES //
////////////////////
// Export clauses can contain an alias
const exportClauses = `
`

// ASSIGNMENT SPECIAL CASE
// this is for example if I use something like
// ```
// const myEndpoint = new Hono()
// myEndpoint.get('/', (c) => c.text('Hello World'))
// ```
// It will include the myEndpoint.get to the code of the assignment
const extraAssignmentCode = (name: string) => `
`

const calls = `
`

///////////
// Assignments are necessary to get the correct calls. For example:
// > my_class = MyClass()
// > my_class.my_method()
// should be considered as a call to MyClass.my_method()
const anyAssignments = `
`

export const phpQueries: treeSitterQueries = {
    importStatements,
    constructorDefinitions: assignments + constructorDefinitions,
    definitionTemplate,
    exportClauses,
    extraAssignmentCode,
    calls,
    assignments: anyAssignments
}