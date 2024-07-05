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
(expression_statement (include_expression (string (string_content) @module ))) @import_statement
(expression_statement (include_once_expression (string (string_content) @module ))) @import_statement
(expression_statement (require_expression (string (string_content) @module ))) @import_statement
(expression_statement (require_once_expression (string (string_content) @module ))) @import_statement
`

/////////////////
// ASSIGNMENTS //
/////////////////
// Arrow functions are like assignments but contains a body in value
// Therefore, to remove them from assignments check if body exists in @right

// Global only
const assignments = `
(program
	(expression_statement
		(assignment_expression left: (variable_name)
        					   right: (_)
        ) @assignment 
	) 
)
`

//////////////////////////
// DEFINITIONS TEMPLATE //
//////////////////////////

const definitionTemplate = `
( _
  (visibility_modifier)? @modifier
  name: (_) @name
  parameters: (formal_parameters (_) @param)?
  return_type: _? @return_type
  body: (_) @body ; NOTE: interfaces do not have a body
)

; For global assignments   
(assignment_expression left: (variable_name (name) @name))
`


const constructorDefinitions = `
(class_declaration) @class
(method_declaration) @function ; also considered as a function
(function_definition) @function
(interface_declaration) @interface
(namespace_definition body: (_) ) @namespace
`

////////
// Space Declaration: namespace
const spaceDeclaration = `
(namespace_definition name: (_) @spaceName !body)
`

// ASSIGNMENT SPECIAL CASE
// this is for example if I use something like
// ```
// const myEndpoint = new Hono()
// myEndpoint.get('/', (c) => c.text('Hello World'))
// ```
// It will include the myEndpoint.get to the code of the assignment
const extraAssignmentCode = (name: string) => `
(program
	(expression_statement
		(binary_expression left: (_
        		(variable_name (name) @identifier.name))
        (#eq? @identifier.name "${name}")
        ) @code
	) 
)
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
    exportClauses: '',
    extraAssignmentCode,
    calls,
    assignments: anyAssignments,
    spaceDeclaration
}