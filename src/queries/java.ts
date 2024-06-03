// Tree-sitter definition + call queries for Java

// It considers:
// - Import statements
// - Class definitions

// - Class and methods
// - member expressions like this.my_method and Class.my_method
// - Arguments

import { treeSitterQueries } from './index';

///////////////////////
// IMPORT_STATEMENTS //
///////////////////////
const importStatements = `
(import_declaration 
	[(scoped_identifier
    	scope: (_) @module
        name: (_) @name)
    (identifier) @module
    ]
) @import_statement
`

/////////////////
// ASSIGNMENTS //
/////////////////
// Java has no global assignments
const assignments = ``

//////////////////////////
// DEFINITIONS TEMPLATE //
//////////////////////////
// modifier can be public, private or protected. By default is private
const definitionTemplate = `
( _
	(modifiers) @modifier 
    type: (_)? @return_type
    name: (_) @name
    parameters: (formal_parameters (_) @param)?
    body: (_) @body
)?
`


// constructor methods have the same name as the class
// NOTE: @function is passed as method if is inside a class
const constructorDefinitions = `
(constructor_declaration)? @function
(method_declaration)? @function
(class_declaration) @class
`

////////////////////
// EXPORTS_CLAUSES //
////////////////////
// No export clauses
const exportClauses = ``

// ASSIGNMENT SPECIAL CASE
// TODO
const extraAssignmentCode = (name: string) => `` 

// TODO
const calls = ``

///////////
// Assignments are necessary to get the correct calls. For example:
// > my_class = MyClass()
// > my_class.my_method()
// TODO
const anyAssignments = ``

export const javaQueries: treeSitterQueries = {
    importStatements,
    constructorDefinitions: assignments + constructorDefinitions,
    definitionTemplate,
    exportClauses,
    extraAssignmentCode,
    calls,
    assignments: anyAssignments
}