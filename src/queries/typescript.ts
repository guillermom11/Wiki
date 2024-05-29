// Tree-sitter definition queries for Typescript

// It consider:
// - Import statements
// - Global Assignments
// - Function definitions
// - Class definitions
// - Interface definitions
// - Enums definitions
// - Export clauses

import { jsQueries } from './javascript';
import { treeSitterQueries } from './index';

///////////////////////
// IMPORT_STATEMENTS //
///////////////////////
// The same as for JavaScript
const importStatements = jsQueries.importStatements


//////////////////////////
// DEFINITIONS TEMPLATE //
//////////////////////////
const definitionTemplate = `
( _
    name: (_) @name
    parameters: (formal_parameters (_) @param)?
    return_type: (type_annotation)? @return_type
    ; method signatures has no body
    [body: (_)
    ; for types
    value: (_)] @body
)?

; arrow function
(variable_declarator
	name: (_) @name
	value: (arrow_function
    	parameters: (formal_parameters (_) @param)?
        return_type: (type_annotation)? @return_type
        body: (_)? @body
			)
)?
`


// The same as for JavaScript, but with interfaces and enums
const constructorDefinitions = jsQueries.constructorDefinitions + `
; interfaces
(method_signature)? @function
(interface_declaration) @interface

; enums
(enum_declaration) @enum

; type
(program
    ( type_alias_declaration
        name: (_)
        value: (_ !body)
    ) @type
) 

; type exportables
(program
    (export_statement
        ( type_alias_declaration
            name: (_)
            value: (_ !body)
        ) @type
    )
)
`


/////////////////////
// EXPORTS_CLAUSES //
/////////////////////
//The same as for JavaScript
const exportClauses = jsQueries.exportClauses

////////////////////
////ASSIGNMENT SPECIAL CASE
// We need to know the assignment name
const extraAssignmentCode = jsQueries.extraAssignmentCode


const calls = jsQueries.calls + `
; type identifiers: IMPORTANT! for classes this means a call to itself! we need to remove it
(type_identifier) @parameter_type
`

////////////////
// Assignments are necessary to get the correct calls. For example:
// > my_class = MyClass()
// > my_class.my_method()
// should be considered as a call to MyClass.my_method()
const anyAssignments = jsQueries.assignments + `
(function_declaration
	parameters: (formal_parameters 
    	(_
        	(identifier) @left
        	(type_annotation (type_identifier) @right)
        ) @assignment) 
)
`

export const tsQueries : treeSitterQueries = {
    importStatements,
    constructorDefinitions,
    definitionTemplate,
    exportClauses,
    extraAssignmentCode,
    calls,
    assignments: anyAssignments
}